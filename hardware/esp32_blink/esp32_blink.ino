// Preload BEFORE the instructor demonstration. This file is never supplied
// to the lesson-generation prompts. Assembly still requires supervisor review.
constexpr int LED_PIN = 23;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  delay(500);
  digitalWrite(LED_PIN, LOW);
  delay(500);
}
