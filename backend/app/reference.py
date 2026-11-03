"""Public reference assets served for an opaque-origin sandbox, never credentials."""
from fastapi.staticfiles import StaticFiles

class ReferenceFiles(StaticFiles):
    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Cross-Origin-Resource-Policy'] = 'cross-origin'
        response.headers['Referrer-Policy'] = 'no-referrer'
        if response.headers.get('content-type', '').startswith('text/html'):
            response.headers['Content-Security-Policy'] = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts"
            response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
        return response
