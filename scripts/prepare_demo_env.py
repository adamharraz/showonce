"""Prepare ignored Render demo settings without printing or committing secrets."""
import argparse
from pathlib import Path
import secrets
from urllib.parse import urlparse
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('origin', nargs='?', help='Optional HTTPS origin; Render supplies its assigned URL automatically')
    args = parser.parse_args()
    origin = args.origin.rstrip('/') if args.origin else ''
    if origin:
        parsed = urlparse(origin)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.path or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise SystemExit('Use a plain HTTPS origin without a path or credentials.')
    source = dotenv_values(ROOT / 'backend' / '.env')
    key = source.get('GEMINI_API_KEY', '')
    if not key or source.get('FREE_TIER_CONFIRMED', '').lower() != 'true':
        raise SystemExit('Configure a Gemini key and verify free-tier access locally first.')
    folder = ROOT / '.data'
    folder.mkdir(exist_ok=True)
    access_file = folder / 'demo-access.txt'
    if access_file.exists():
        access_code = access_file.read_text(encoding='utf-8').strip()
    else:
        access_code = secrets.token_urlsafe(32)
        access_file.write_text(access_code + '\n', encoding='utf-8')
    values = dict(STORAGE_MODE='local', ALLOW_LOCAL_LOGIN='false', DEMO_MODE='true',
                  DEMO_ACCESS_CODE=access_code, GEMINI_API_KEY=key,
                  FREE_TIER_CONFIRMED='true',
                  TWIN_ENABLED='false', LIVE_COACH_ENABLED='true', DATA_DIR='/app/.data')
    if origin:
        values['APP_ORIGIN'] = origin
    env_file = folder / 'render-demo.env'
    env_file.write_text(''.join(f'{name}={value}\n' for name, value in values.items()), encoding='utf-8')
    print('Prepared private .data/render-demo.env and .data/demo-access.txt. No secrets printed.')

if __name__ == '__main__':
    main()
