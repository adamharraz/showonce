"""Private Modal worker for Relay-style single-photo GLB generation.

Deploy with the project SDK:
  python -m modal deploy modal_app/sf3d_worker.py --env main
Requires the showonce-huggingface Secret with HF_TOKEN before deployment.
No public GPU endpoint is created. ShowOnce calls authenticated Modal functions.
"""
import os
import modal

SOURCE_REVISION = 'ff21fc491b4dc5314bf6734c7c0dabd86b5f5bb2'
WEIGHT_REVISION = 'f0c9a8ffd62cb1bbc8a7a53c9f87a0be1b6be778'
MODEL = 'stabilityai/stable-fast-3d'
app = modal.App('showonce-sf3d')
cache = modal.Volume.from_name('showonce-sf3d-cache', create_if_missing=True)
# Modal imports this module inside containers too. Define the same dependencies
# locally and remotely; a local-only environment conditional breaks hydration.
HF_SECRET_NAME = 'showonce-huggingface'
hf_secrets = [modal.Secret.from_name(HF_SECRET_NAME, required_keys=['HF_TOKEN'])]

# Build CUDA extensions on the CPU builder, targeting only the chosen A10.
gpu_image = (
    modal.Image.from_registry('nvidia/cuda:12.1.1-devel-ubuntu22.04', add_python='3.11')
    .apt_install('git','build-essential','cmake','libeigen3-dev','libglib2.0-0','libgl1','libgomp1')
    .pip_install('setuptools==69.5.1','wheel==0.44.0','ninja==1.11.1.1')
    .pip_install('torch==2.4.0+cu121','torchvision==0.19.0+cu121', index_url='https://download.pytorch.org/whl/cu121')
    .pip_install('numpy==1.26.4')
    .apt_install('clang')
    .env({'USE_CUDA':'1','USE_NATIVE_ARCH':'0','TORCH_CUDA_ARCH_LIST':'8.6','CUDA_HOME':'/usr/local/cuda','MAX_JOBS':'2'})
    .run_commands(
        'git clone https://github.com/Stability-AI/stable-fast-3d.git /opt/sf3d',
        f'cd /opt/sf3d && git checkout {SOURCE_REVISION}',
        'cd /opt/sf3d && pip install --no-build-isolation -r requirements.txt',
        'cd /opt/sf3d && python -c "from sf3d.system import SF3D; import texture_baker, uv_unwrapper"',
    )
    .env({'PYTHONPATH':'/opt/sf3d','HF_HOME':'/cache/hf','U2NET_HOME':'/cache/u2net'})
)
prepare_image = modal.Image.debian_slim(python_version='3.11').pip_install('huggingface-hub==0.23.4','httpx==0.28.1')

@app.function(image=prepare_image, secrets=hf_secrets, volumes={'/cache':cache},
              cpu=1, memory=2048, timeout=420, retries=0, max_containers=1, scaledown_window=5)
def prepare_model():
    """Download gated weights on a CPU, before paying for GPU startup."""
    import json, hashlib
    from pathlib import Path
    from huggingface_hub import snapshot_download
    manifest = Path('/cache/ready.json')
    if manifest.exists():
        data = json.loads(manifest.read_text())
        if data.get('revision') == WEIGHT_REVISION and (Path(data['path'])/'model.safetensors').exists() and Path('/cache/u2net/u2net.onnx').exists():
            return {'ready':True,'model':MODEL,'revision':WEIGHT_REVISION,'cached':True}
    if not os.getenv('HF_TOKEN'):
        raise RuntimeError('Accept the model licence and configure HF_TOKEN in the showonce-huggingface Modal secret.')
    path = snapshot_download(repo_id=MODEL, revision=WEIGHT_REVISION, token=os.environ['HF_TOKEN'],
        cache_dir='/cache/hf', allow_patterns=['config.yaml','model.safetensors'])
    # Prepare the background model on the CPU too, avoiding GPU download time.
    import httpx
    background = Path('/cache/u2net/u2net.onnx'); background.parent.mkdir(parents=True,exist_ok=True)
    if not background.exists():
        temporary = background.with_suffix('.download')
        with httpx.stream('GET','https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx',follow_redirects=True,timeout=120) as response:
            response.raise_for_status()
            with temporary.open('wb') as output:
                for chunk in response.iter_bytes(): output.write(chunk)
        temporary.replace(background)
    # Same integrity hash used by rembg 2.0.57's official U2netSession.
    if hashlib.md5(background.read_bytes()).hexdigest() != '60024c5c889badc19c04ad937298a77b':
        background.unlink()
        raise RuntimeError('Background model checksum mismatch; no GPU was started')
    manifest.write_text(json.dumps({'path':path,'revision':WEIGHT_REVISION}))
    cache.commit()
    return {'ready':True,'model':MODEL,'revision':WEIGHT_REVISION,'cached':False}

@app.cls(image=gpu_image, gpu='A10', cpu=2, memory=8192, volumes={'/cache':cache},
         min_containers=0, max_containers=1, scaledown_window=5,
         timeout=180, startup_timeout=180, retries=0)
class SF3DWorker:
    @modal.enter()
    def load(self):
        import json
        from pathlib import Path
        from sf3d.system import SF3D
        import rembg
        manifest = json.loads(Path('/cache/ready.json').read_text())
        if manifest['revision'] != WEIGHT_REVISION: raise RuntimeError('Prepare the pinned weights first')
        self.model = SF3D.from_pretrained(manifest['path'],config_name='config.yaml',weight_name='model.safetensors').to('cuda').eval()
        self.background = rembg.new_session('u2net',providers=['CPUExecutionProvider'])

    @modal.method()
    def generate(self, photo:bytes, remove_background:bool=True):
        import io,time
        import torch
        from PIL import Image
        from sf3d.utils import remove_background as remove_bg, resize_foreground
        started = time.monotonic()
        if not isinstance(photo,bytes) or not 0 < len(photo) <= 2000000: raise ValueError('Invalid photo')
        with Image.open(io.BytesIO(photo)) as input_image:
            if input_image.width * input_image.height > 1024*1024: raise ValueError('Photo must be normalized first')
            image = input_image.convert('RGBA')
        if remove_background: image = remove_bg(image,self.background)
        image = resize_foreground(image,0.85)
        with torch.no_grad(), torch.autocast(device_type='cuda',dtype=torch.bfloat16):
            mesh,_ = self.model.run_image(image,bake_resolution=1024,remesh='none',vertex_count=-1)
        data = mesh.export(file_type='glb',include_normals=True)
        if not isinstance(data,bytes) or len(data)>50*1024*1024: raise RuntimeError('Invalid generated mesh')
        return {'glb':data,'generation_seconds':round(time.monotonic()-started,3),
                'model':MODEL,'revision':WEIGHT_REVISION,'gpu':'A10','texture_resolution':1024}

@app.function(image=prepare_image, cpu=.125, memory=256, timeout=30, retries=0, scaledown_window=5,
              env={'SHOWONCE_HF_SECRET_ATTACHED':'true'})
def readiness():
    # Deployment status only. Does not start a GPU or download model weights.
    return {'model':MODEL,'source_revision':SOURCE_REVISION,'weight_revision':WEIGHT_REVISION,
            'hf_secret_attached':os.getenv('SHOWONCE_HF_SECRET_ATTACHED')=='true','gpu':'A10','public_endpoint':False}
