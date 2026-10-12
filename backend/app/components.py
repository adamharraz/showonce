"""A small reference catalogue, never an assumed lesson or target circuit."""
from typing import Literal
from pydantic import Field, model_validator
from .models import Strict
from .ai import inference_schema

PartId = Literal['esp32', 'breadboard', 'led', 'resistor', 'wire', 'unknown']

class Pin(Strict):
    id: str
    label: str
    x: float
    z: float

class Variant(Strict):
    id: str
    name: str
    description: str
    pins: list[Pin]
    source: str

class Part(Strict):
    id: PartId
    name: str
    description: str
    asset: str
    limitations: str
    variants: list[Variant] = Field(default_factory=list)

# Header order adapted from Wokwi's MIT-licensed DevKit V1 pin metadata.
# This is ONE 30-pin board layout, not the pinout of every ESP32/WROOM board.
LEFT = ['VIN', 'GND.2', 'D13', 'D12', 'D14', 'D27', 'D26', 'D25', 'D33', 'D32', 'D35', 'D34', 'VN', 'VP', 'EN']
RIGHT = ['3V3', 'GND.1', 'D15', 'D2', 'D4', 'RX2', 'TX2', 'D5', 'D18', 'D19', 'D21', 'RX0', 'TX0', 'D22', 'D23']
DEVKIT = Variant(id='devkit-v1-30', name='ESP32 DevKit V1 · 30 pins',
    description='Confirm 15 headers on each side and the complete matching printed pin order. WROOM on the shield alone is insufficient.',
    source='https://github.com/wokwi/wokwi-elements/blob/72d8b5b1f472121987d8c74b60a0e7a5d756c54c/src/esp32-devkit-v1-element.ts',
    pins=[Pin(id=label, label=label.replace('GND.1','GND').replace('GND.2','GND'), x=x, z=2.1-i*.3)
          for x, labels in [(-1.05, LEFT), (1.05, RIGHT)] for i, label in enumerate(labels)])
PARTS = [
    Part(id='esp32', name='ESP32 development board', asset='esp32',
         description='A generic development-board reference; an ESP32 family identification does not establish the exact board.',
         limitations='Exact header labels stay hidden until you confirm a supported board variant.', variants=[DEVKIT]),
    Part(id='breadboard', name='Solderless breadboard', asset='breadboard',
         description='A generic breadboard reference with two terminal strips and a centre channel.',
         limitations='Hole count, split power rails and internal continuity vary; this model does not verify them.'),
    Part(id='led', name='Through-hole LED', asset='led',
         description='A generic two-lead LED reference.',
         limitations='Display colour is illustrative. Polarity, lead length and rating require evidence or manual confirmation.'),
    Part(id='resistor', name='Axial resistor', asset='resistor',
         description='A generic axial resistor reference with no assumed resistance or colour bands.',
         limitations='An unreadable value stays unknown. The illustration is not a rating or resistance measurement.'),
    Part(id='wire', name='Jumper wire', asset='wire',
         description='A generic insulated jumper-wire reference.',
         limitations='The displayed curve does not reproduce your wiring or establish connected endpoints.'),
    Part(id='unknown', name='Unidentified object', asset='unknown',
         description='A placeholder for an unsupported or uncertain component.',
         limitations='Provide a closer view or correct the component identity yourself.'),
]
CATALOGUE = {part.id: part for part in PARTS}

class Catalogue(Strict):
    version: str = '1'
    parts: list[Part] = Field(default_factory=lambda: PARTS)

class DetectedPart(Strict):
    id: str = Field(pattern=r'^[a-zA-Z0-9_-]{1,40}$')
    part_id: PartId
    evidence: str = Field(min_length=1, max_length=500)
    uncertain: bool = True
    value_text: str | None = Field(default=None, max_length=120)
    value_source: Literal['visible', 'narrated'] | None = None

    @model_validator(mode='after')
    def grounded_value(self):
        if bool(self.value_text) != bool(self.value_source):
            raise ValueError('A value and its visible/narrated source must be supplied together')
        return self

class InspectionOutput(Strict):
    frame_id: str = Field(max_length=100)
    components: list[DetectedPart] = Field(max_length=12)
    questions: list[str] = Field(default_factory=list, max_length=6)

    @model_validator(mode='after')
    def unique_components(self):
        ids = [part.id for part in self.components]
        if len(ids) != len(set(ids)):
            raise ValueError('Component IDs must be unique')
        if any(len(q) > 500 for q in self.questions):
            raise ValueError('Clarification question is too long')
        return self

class ScenePart(DetectedPart):
    value_source: Literal['visible', 'narrated', 'user-confirmed'] | None = None
    variant_id: str | None = None
    confirmed: bool = False
    confirmation_note: str = ''
    highlighted_pin: str | None = None

class ComponentScene(Strict):
    revision: int = 0
    frame_id: str | None = None
    timestamp_ms: int | None = None
    components: list[ScenePart] = Field(default_factory=list)
    questions: list[str] = Field(default_factory=list)

class PartEdit(Strict):
    revision: int = Field(ge=0)
    component_id: str
    part_id: PartId
    variant_id: str | None = None
    value_text: str | None = Field(default=None, max_length=120)
    note: str = Field(min_length=1, max_length=500)

def edit_part(scene: ComponentScene, edit: PartEdit) -> ComponentScene:
    if edit.revision != scene.revision:
        raise ValueError('The component list changed. Review the latest result before confirming.')
    part = next((p for p in scene.components if p.id == edit.component_id), None)
    if not part:
        raise ValueError('Component not found')
    if edit.variant_id and not any(v.id == edit.variant_id for v in CATALOGUE[edit.part_id].variants):
        raise ValueError('Unsupported variant for this component')
    result = scene.model_copy(deep=True)
    target = next(p for p in result.components if p.id == edit.component_id)
    target.part_id, target.variant_id = edit.part_id, edit.variant_id
    target.value_text, target.value_source = edit.value_text or None, 'user-confirmed' if edit.value_text else None
    target.confirmed, target.uncertain, target.confirmation_note = True, False, edit.note
    target.highlighted_pin = None
    result.revision += 1
    return result

TOOL = {
    'name': 'show_components',
    'description': 'Display a catalogue reference for components supported by the requested camera snapshot. This replaces the inventory, never reconstructs wiring or establishes safety. Return unknown for unsupported or uncertain identities. Do not infer board variants, unreadable resistor values, polarity or connections. Use stable component IDs. Include only seen objects, not parts suggested by the goal or lesson.',
    'parameters_json_schema': inference_schema(InspectionOutput),
}
TOOL['parameters_json_schema']['properties']['components']['items']['required'].append('id')

def catalogue_context():
    return [{'id': p.id, 'name': p.name, 'limitations': p.limitations} for p in PARTS]
