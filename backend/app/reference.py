"""Public reference assets served for an opaque-origin sandbox, never credentials."""
from fastapi.staticfiles import StaticFiles

class ReferenceFiles(StaticFiles):
    def __init__(self, *args, permitted_origin="", allow_downloads=False, **kwargs):
        super().__init__(*args, **kwargs)
        # An opaque-origin sandbox needs an explicit resource origin in Chromium.
        self.resource_sources = "'self'" + (" " + permitted_origin if permitted_origin else "")
        self.sandbox = 'allow-scripts allow-downloads' if allow_downloads else 'allow-scripts'

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Cross-Origin-Resource-Policy'] = 'cross-origin'
        response.headers['Referrer-Policy'] = 'no-referrer'
        if response.headers.get('content-type', '').startswith('text/html'):
            response.headers['Content-Security-Policy'] = f"default-src 'none'; script-src {self.resource_sources} 'unsafe-inline'; style-src {self.resource_sources} 'unsafe-inline'; img-src {self.resource_sources} data: blob:; font-src {self.resource_sources} data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox {self.sandbox}"
            response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
        return response
