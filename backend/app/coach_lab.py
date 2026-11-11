"""Electronics Lab recommendations from the current Gemini Live turn."""
from typing import Literal

from pydantic import Field

from .ai import inference_schema
from .models import Strict


ArduinoTopic = Literal[
    'board', 'blink', 'button', 'knob', 'rgb', 'light', 'sensor', 'sound',
    'piano', 'motor', 'heat', 'servo', 'stepper', 'plant', 'force', 'project',
]
LabTopic = Literal[ArduinoTopic, 'resistor', 'return_path', 'workbench', 'arduino_course']


class LabSuggestions(Strict):
    topics: list[LabTopic] = Field(max_length=3)
    view: Literal['auto', 'workbench', 'course'] = 'auto'


LAB_TOOL = {
    'name': 'suggest_electronics_lab',
    'description': (
        'Recommend up to three Electronics Lab resources for the current teaching topic. '
        'Choose view workbench for free placement/wiring/simulation or course for guided lessons; '
        'auto retains both relevant choices. Use topic workbench for a blank bench or '
        'arduino_course for a general course introduction. '
        'using your understanding of the live conversation and media. Send an empty list to clear '
        'outdated suggestions after the topic changes.'
    ),
    'parameters_json_schema': inference_schema(LabSuggestions),
}

LAB_PROMPT = '''
When your normal reply identifies a relevant electronic component or explains an electronics topic
that matches an Electronics Lab tutorial, call suggest_electronics_lab in that same reply.
Use what the learner says, the lesson or current live evidence. No snapshot or separate request is
needed. Prioritize what the learner wants to understand over incidental objects. For a camera-only
identification, recommend a matching topic only when the evidence is clear. If the task is about
an unsupported object or topic, do not force a recommendation. Replace the list when it changes,
clear it with an empty list when the learner moves to an unrelated topic, and do not repeat unchanged lists.
Topic IDs: workbench (blank 3D Workbench), arduino_course (Arduino Course overview),
board (development board basics), blink (basic LED circuit), button (pushbutton),
knob (potentiometer), rgb (RGB LED), light (photoresistor), sensor (ultrasonic distance),
sound (buzzer), piano (mini piano), motor (DC motor), heat (temperature), servo (servo),
stepper (stepper motor), plant (plant monitoring), force (force sensor), project (capstone),
resistor (current through a resistor), return_path (ground and the return path).
The app displays the links. Continue coaching naturally and let the learner decide whether to open one.'''
