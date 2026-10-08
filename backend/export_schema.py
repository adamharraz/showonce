"""Generate the frontend API types from the Pydantic/FastAPI source of truth."""
import json
from pathlib import Path
from app.main import app
from app.models import LessonDraft, Observation, AssessmentOutput, Question, Step, Criterion

schema = app.openapi()
for model in (LessonDraft, Observation, AssessmentOutput, Question, Step, Criterion):
    value = model.model_json_schema(ref_template='#/components/schemas/{model}')
    definitions = value.pop('$defs', {})
    schema['components']['schemas'].update(definitions)
    schema['components']['schemas'][model.__name__] = value
Path(__file__).with_name('openapi.json').write_text(json.dumps(schema, indent=2), encoding='utf-8')
