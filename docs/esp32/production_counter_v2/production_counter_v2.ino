/*
  ESP32 + Ultrasonic Sensor + HW-111 RTC + Push Button (SKU select)
  + LED (SKU indicator) + LED (Internet status)

  === WHAT THIS DOES ===
  Counts boxes/items passing under an ultrasonic sensor.
  Each detection = 1 log entry timestamped and queued.
  Sends ALL queued logs to Supabase when WiFi is available.
  Offline-safe: queue stored in LittleFS (survives power cuts).

  === HARDWARE MAP ===
  - Ultrasonic: TRIG->GPIO 5, ECHO->GPIO 18
  - HW-111 RTC: SDA->GPIO 21, SCL->GPIO 22
  - Push button: GPIO 4 (internal pull-up, other leg to GND)
  - SKU indicator LED: GPIO 2 (anode -> 220 ohm -> GPIO 2)
  - Internet status LED: GPIO 15 (anode -> 220 ohm -> GPIO 15)

  === CONTROLS ===
  - Short press button (< 800ms): LED blinks current SKU index number
  - Long press button (> 800ms): cycle to next SKU, LED blinks new index

  === LIBRARIES (install via Arduino Library Manager) ===
  - RTClib by Adafruit
  - LittleFS (built-in with ESP32 board package 2.x+)

  === CONFIGURATION ===
  Set your WiFi credentials and Supabase details below.
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <RTClib.h>
#include <Preferences.h>
#include <LittleFS.h>

// =====================================================================
// DEVICE SETUP GUIDE
// =====================================================================
// 1. FLASH this code to your ESP32.
// 2. CONNECT to Serial Monitor (115200 baud) — the device prints its ID.
// 3. NOTE the Device ID (e.g., "AABBCCDDEEFF") printed on boot.
// 4. LOG IN to the NEWBIZ web dashboard → Admin → Production Devices.
// 5. ADD a mapping: enter that Device ID, choose an Index (1,2,3...),
//    and select the Item from the dropdown.
// 6. REPEAT step 5 for each index slot you want to use on this device.
// 7. LONG PRESS the button on the device to cycle between indexes.
//    Short press shows which index is currently selected.
//
// The device sends {device_id, device_index, timestamp} to Supabase.
// The server resolves which item maps to that device+index.
// =====================================================================

// =====================================================================
// USER CONFIGURATION
// =====================================================================

// WiFi networks — add as many as needed. Device tries them in order.
const char* WIFI_NETWORKS[][2] = {
  {"KOUSHIK",       "Rajkumar@123"},
  {"FKGTR_Flipkart-2.4",  "Satellitehub_FKGTR"},
  {"MIFI_4G/5G_C7AC", "1234567890" },
  {"Flipkart_FKGTR", "Satellitehub_FKGTR"},
  {"oneplus nord", "1234567800"},
  // {"WORK_WIFI", "work_pass"},
};
const int WIFI_NETWORK_COUNT = sizeof(WIFI_NETWORKS) / sizeof(WIFI_NETWORKS[0]);
int currentWifiIndex = 0;

// How long to wait on one network before trying the next (milliseconds)
const unsigned long WIFI_RETRY_MS = 8000;

// Supabase
const char* SUPABASE_URL    = "https://wmpxwpubfxpexybqnynz.supabase.co";
const char* SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtcHh3cHViZnhwZXh5YnFueW56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNDkyMDksImV4cCI6MjA5OTkyNTIwOX0.eX99SltvlCCj4nuhcc9GbbnJp4g1L-_Lnn_RioF4l6k";

// Timezone offset (India = UTC+5:30)
const int TZ_OFFSET_HOURS = 5;
const int TZ_OFFSET_MINUTES = 30;

// NTP servers for time sync
const char* NTP_SERVER1 = "pool.ntp.org";
const char* NTP_SERVER2 = "time.google.com";

// =====================================================================
// PIN DEFINITIONS
// =====================================================================
const int TRIG_PIN = 5;
const int ECHO_PIN = 18;
const int BUTTON_PIN = 4;
const int SKU_LED_PIN = 2;
const int NET_LED_PIN = 25;

// =====================================================================
// DETECTION TUNING (calibrate for your setup)
// =====================================================================
const float THRESHOLD_LOW_CM  = 18.0;
const float THRESHOLD_HIGH_CM = 25.0;
const unsigned long MIN_PRESENCE_MS = 100;
const unsigned long DEBOUNCE_MS = 300;

// =====================================================================
// SKU LIST — edit to match your production items
// The device sends device_index (1-based) in logs.
// The server maps device_index -> item_id via production_device_config.
// =====================================================================
const char* SKU_LIST[] = {"Index 1", "Index 2", "Index 3"};
const int SKU_COUNT = 3;
int currentSkuIndex = 0;

// =====================================================================
// BUTTON
// =====================================================================
const unsigned long LONG_PRESS_MS = 800;
bool buttonIsPressed = false;
unsigned long buttonPressStartTime = 0;
bool longPressHandled = false;

// =====================================================================
// SKU LED BLINK STATE MACHINE
// =====================================================================
bool blinkActive = false;
int blinksRemaining = 0;
bool ledCurrentlyOn = false;
unsigned long lastBlinkToggle = 0;
const unsigned long BLINK_ON_MS = 250;
const unsigned long BLINK_OFF_MS = 250;

// =====================================================================
// INTERNET LED STATE
// =====================================================================
enum NetState { NET_OFF, NET_CONNECTING, NET_CONNECTED };
NetState currentNetState = NET_OFF;
unsigned long lastNetBlinkToggle = 0;
bool netLedOn = false;

// =====================================================================
// FILTER
// =====================================================================
const int FILTER_SAMPLES = 5;
float distanceBuffer[FILTER_SAMPLES];
int filterIndex = 0;
bool filterFilled = false;

// =====================================================================
// STATE MACHINE
// =====================================================================
enum BoxState { NO_BOX, BOX_ENTERING, BOX_PRESENT };
BoxState currentState = NO_BOX;
unsigned long stateChangeTime = 0;
unsigned long lastCountTime = 0;

// =====================================================================
// RTC
// =====================================================================
RTC_DS1307 rtc;
String currentDateStr = "";
String currentDateCompact = "";

// =====================================================================
// PERSISTENT STORAGE (NVS — daily counters + device ID)
// =====================================================================
Preferences prefs;
unsigned long todayCount = 0;
unsigned long totalCount = 0;
String deviceId = "";

// =====================================================================
// LITTLEFS LOG QUEUE
// =====================================================================
const char* QUEUE_FILE = "/logs.txt";
const size_t MAX_BATCH_SIZE = 50;

// =====================================================================
// WIFI / SYNC
// =====================================================================
unsigned long lastSyncAttempt = 0;
const unsigned long SYNC_INTERVAL_MS = 5000;
bool syncInProgress = false;
unsigned long lastWiFiCheck = 0;
const unsigned long PING_INTERVAL_MS = 60000;
unsigned long lastPingCheck = 0;

// =====================================================================
// HTTP CLIENT (reusable)
// =====================================================================
HTTPClient http;

// =====================================================================
// FUNCTION DECLARATIONS
// =====================================================================
String getDateString(DateTime now);
String getDateCompact(DateTime now);
String formatTimestamp(DateTime now);
String getDeviceId();
void initLittleFS();
void appendToQueue(const String& line);
bool flushQueueToSupabase();
void loadCurrentCounts();
void saveCurrentCounts();
void saveSkuIndex();
void loadSkuIndex();
void startBlinkSequence(int numBlinks);
void updateBlinkSequence();
void updateNetLed();
void connectWiFi();
void tryNextWiFi();
void syncRtcFromNtp();
float readRawDistanceCM();
float getFilteredDistanceCM();
bool uploadToSupabase(const String& jsonBody);
String extractJsonString(const String& json, const String& key);
String extractJsonNumber(const String& json, const String& key);

// =====================================================================
// SETUP
// =====================================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  // Pins
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(SKU_LED_PIN, OUTPUT);
  pinMode(NET_LED_PIN, OUTPUT);
  digitalWrite(SKU_LED_PIN, LOW);
  digitalWrite(NET_LED_PIN, LOW);

  // Filter buffer
  for (int i = 0; i < FILTER_SAMPLES; i++) distanceBuffer[i] = 0;

  // Initialize WiFi in station mode so macAddress() works
  WiFi.mode(WIFI_STA);

  // I2C for RTC
  Wire.begin(21, 22);

  // RTC
  if (!rtc.begin()) {
    Serial.println("ERROR: RTC not found! Check wiring.");
    while (1) { delay(1000); }
  }
  // RTC has battery backup — time is preserved across power cuts.
  // We'll adjust it from NTP after WiFi connects (see syncRtcFromNtp()).

  // Device ID (from MAC address)
  deviceId = getDeviceId();
  Serial.print("Device ID: ");
  Serial.println(deviceId);

  // LittleFS
  initLittleFS();

  // NVS
  loadSkuIndex();

  // Date
  DateTime now = rtc.now();
  currentDateStr = getDateString(now);
  currentDateCompact = getDateCompact(now);
  loadCurrentCounts();

  // WiFi
  connectWiFi();

  // Sync RTC from NTP if WiFi is connected
  if (WiFi.status() == WL_CONNECTED) {
    syncRtcFromNtp();
  } else {
    Serial.println("No WiFi — RTC keeps previous time (battery backup).");
  }

  // Show current SKU on boot
  startBlinkSequence(currentSkuIndex + 1);

  Serial.println("--- Production Counter Ready ---");
  Serial.print("Device: "); Serial.println(deviceId);
  Serial.print("SKU: "); Serial.println(SKU_LIST[currentSkuIndex]);
  Serial.print("Date: "); Serial.println(currentDateStr);
  Serial.print("Today: "); Serial.println(todayCount);
}

// =====================================================================
// LOOP
// =====================================================================
void loop() {
  unsigned long nowMs = millis();

  // ---- WiFi Management (with fallback across networks) ----
  if (WiFi.status() != WL_CONNECTED) {
    if (nowMs - lastWiFiCheck > WIFI_RETRY_MS) {
      lastWiFiCheck = nowMs;
      tryNextWiFi();  // round-robin through all configured networks
    }
    updateNetLed();  // blink = connecting
  } else {
    updateNetLed();  // solid = connected
  }

  // ---- Button ----
  bool rawState = (digitalRead(BUTTON_PIN) == LOW);
  if (rawState && !buttonIsPressed) {
    buttonIsPressed = true;
    buttonPressStartTime = nowMs;
    longPressHandled = false;
  }
  if (rawState && buttonIsPressed && !longPressHandled) {
    if (nowMs - buttonPressStartTime >= LONG_PRESS_MS) {
      longPressHandled = true;
      currentSkuIndex = (currentSkuIndex + 1) % SKU_COUNT;
      saveSkuIndex();
      loadCurrentCounts();
      startBlinkSequence(currentSkuIndex + 1);
      Serial.print("Long press -> SKU: ");
      Serial.println(SKU_LIST[currentSkuIndex]);
    }
  }
  if (!rawState && buttonIsPressed) {
    unsigned long heldFor = nowMs - buttonPressStartTime;
    if (heldFor < LONG_PRESS_MS) {
      startBlinkSequence(currentSkuIndex + 1);
      Serial.print("Short press -> current SKU: ");
      Serial.println(SKU_LIST[currentSkuIndex]);
    }
    buttonIsPressed = false;
    longPressHandled = false;
  }

  // ---- SKU LED ----
  updateBlinkSequence();

  // ---- Date Rollover ----
  DateTime now = rtc.now();
  String todayStr = getDateString(now);
  if (todayStr != currentDateStr) {
    Serial.println("Date changed: " + currentDateStr + " -> " + todayStr);
    currentDateStr = todayStr;
    currentDateCompact = getDateCompact(now);
    loadCurrentCounts();
  }

  // ---- Distance Detection ----
  float distance = getFilteredDistanceCM();
  if (distance > 0) {
    unsigned long t = nowMs;
    switch (currentState) {
      case NO_BOX:
        if (distance < THRESHOLD_LOW_CM) {
          currentState = BOX_ENTERING;
          stateChangeTime = t;
        }
        break;
      case BOX_ENTERING:
        if (distance < THRESHOLD_LOW_CM) {
          if (t - stateChangeTime >= MIN_PRESENCE_MS) {
            currentState = BOX_PRESENT;
          }
        } else if (distance > THRESHOLD_HIGH_CM) {
          currentState = NO_BOX;
        }
        break;
      case BOX_PRESENT:
        if (distance > THRESHOLD_HIGH_CM) {
          if (t - lastCountTime > DEBOUNCE_MS) {
            // ---- BOX DETECTED — QUEUE LOG ----
            todayCount++;
            totalCount++;
            lastCountTime = t;
            saveCurrentCounts();

            String timestamp = formatTimestamp(now);
            String logLine = "{\"device_id\":\"" + deviceId
                          + "\",\"device_index\":" + String(currentSkuIndex + 1)
                          + ",\"quantity\":1"
                          + ",\"logged_at\":\"" + timestamp + "\"}";

            appendToQueue(logLine);

            Serial.print("COUNT | SKU: ");
            Serial.print(SKU_LIST[currentSkuIndex]);
            Serial.print(" | Today: ");
            Serial.print(todayCount);
            Serial.print(" | Total: ");
            Serial.println(totalCount);
          }
          currentState = NO_BOX;
        }
        break;
    }
  }

  // ---- Sync Queue to Supabase ----
  if (WiFi.status() == WL_CONNECTED && !syncInProgress) {
    if (nowMs - lastSyncAttempt > SYNC_INTERVAL_MS) {
      lastSyncAttempt = nowMs;
      syncInProgress = true;
      bool ok = flushQueueToSupabase();
      syncInProgress = false;
      if (ok) {
        Serial.println("Sync completed successfully.");
      } else {
        Serial.println("Sync failed — switching WiFi.");
        tryNextWiFi();
      }
    }
  }

  // ---- Connectivity check (no-internet detection when queue is empty) ----
  if (WiFi.status() == WL_CONNECTED && !syncInProgress && nowMs - lastPingCheck > PING_INTERVAL_MS) {
    lastPingCheck = nowMs;
    http.begin(String(SUPABASE_URL) + "/rest/v1/");
    http.addHeader("apikey", SUPABASE_ANON_KEY);
    int code = http.GET();
    http.end();
    if (code <= 0) {
      Serial.print("No internet detected (HTTP ");
      Serial.print(code);
      Serial.println(") — switching WiFi.");
      tryNextWiFi();
    }
  }

  delay(30);
}

// =====================================================================
// DATE / TIME HELPERS
// =====================================================================
String getDateString(DateTime dt) {
  char buf[11];
  sprintf(buf, "%04d-%02d-%02d", dt.year(), dt.month(), dt.day());
  return String(buf);
}

String getDateCompact(DateTime dt) {
  char buf[7];
  sprintf(buf, "%02d%02d%02d", dt.year() % 100, dt.month(), dt.day());
  return String(buf);
}

String formatTimestamp(DateTime dt) {
  char buf[30];
  int h = dt.hour() + TZ_OFFSET_HOURS;
  int m = dt.minute() + TZ_OFFSET_MINUTES;
  if (m >= 60) { m -= 60; h++; }
  if (h >= 24) { h -= 24; }
  sprintf(buf, "%04d-%02d-%02dT%02d:%02d:%02d+%02d:%02d",
          dt.year(), dt.month(), dt.day(),
          h, m, dt.second(),
          TZ_OFFSET_HOURS, TZ_OFFSET_MINUTES);
  return String(buf);
}

// =====================================================================
// DEVICE ID (MAC address)
// =====================================================================
String getDeviceId() {
  prefs.begin("boxcounter", false);
  String stored = prefs.getString("devId", "");
  if (stored.length() > 0) {
    prefs.end();
    return stored;
  }
  stored = WiFi.macAddress();
  stored.replace(":", "");
  prefs.putString("devId", stored);
  prefs.end();
  return stored;
}

// =====================================================================
// LITTLEFS
// =====================================================================
void initLittleFS() {
  if (!LittleFS.begin(true)) {
    Serial.println("ERROR: LittleFS mount failed!");
    return;
  }
  Serial.println("LittleFS mounted.");
  File f = LittleFS.open(QUEUE_FILE, "r");
  if (f) {
    size_t sz = f.size();
    f.close();
    if (sz > 0) {
      Serial.print("Queue file size: ");
      Serial.print(sz);
      Serial.println(" bytes (pending sync)");
    }
  }
}

void appendToQueue(const String& line) {
  File f = LittleFS.open(QUEUE_FILE, "a");
  if (!f) {
    Serial.println("ERROR: cannot open queue file for append");
    return;
  }
  f.println(line);
  f.close();
}

// =====================================================================
// SYNC: READ ALL QUEUED LOGS AND POST TO SUPABASE
// =====================================================================
bool flushQueueToSupabase() {
  File f = LittleFS.open(QUEUE_FILE, "r");
  if (!f) {
    return true;  // nothing to sync
  }
  if (f.size() == 0) {
    f.close();
    return true;
  }

  // Read all lines into a JSON array
  String jsonArray = "[";
  bool first = true;
  int count = 0;

  while (f.available()) {
    String line = f.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) continue;

    // Validate it looks like JSON
    if (!line.startsWith("{")) continue;

    if (!first) jsonArray += ",";
    jsonArray += line;
    first = false;
    count++;
  }
  f.close();

  if (count == 0) {
    LittleFS.remove(QUEUE_FILE);
    return true;
  }
  jsonArray += "]";

  Serial.print("Uploading ");
  Serial.print(count);
  Serial.println(" log entries to Supabase...");

  // POST to Supabase — returns true on success
  bool ok = uploadToSupabase(jsonArray);

  if (ok) {
    LittleFS.remove(QUEUE_FILE);
    Serial.println("Queue cleared after upload.");
  } else {
    Serial.println("Upload failed — keeping queue for retry.");
  }
  return ok;
}

// =====================================================================
// SUPABASE REST API UPLOAD
// =====================================================================
bool uploadToSupabase(const String& jsonBody) {
  // Parse the JSON array and send each log individually via the RPC.
  // We use the single-insert function because the batch jsonb variant
  // has a PostgREST schema cache issue on this project.
  // The JSON body is an array like: [{...},{...}]
  // We extract each object and POST it to the single-insert RPC.

  // Count how many objects in the array
  int count = 0;
  for (int i = 0; i < jsonBody.length(); i++) {
    if (jsonBody.charAt(i) == '{') count++;
  }

  if (count == 0) return true;

  // Extract each JSON object and send individually
  int startIdx = jsonBody.indexOf('{');
  int successCount = 0;

  while (startIdx >= 0) {
    int endIdx = jsonBody.indexOf('}', startIdx);
    if (endIdx < 0) break;

    String singleLog = jsonBody.substring(startIdx, endIdx + 1);

    // Extract fields from the JSON using simple string search
    // {"device_id":"X","device_index":1,"quantity":1,"logged_at":"T"}
    String devId = extractJsonString(singleLog, "device_id");
    String devIdx = extractJsonNumber(singleLog, "device_index");
    String qty = extractJsonNumber(singleLog, "quantity");
    String ts = extractJsonString(singleLog, "logged_at");

    if (devId.length() == 0 || devIdx.length() == 0) {
      startIdx = jsonBody.indexOf('{', endIdx + 1);
      continue;
    }

    // Build the RPC payload with named parameters
    String rpcBody = "{";
    rpcBody += "\"p_device_id\":\"" + devId + "\"";
    rpcBody += ",\"p_device_index\":" + devIdx;
    rpcBody += ",\"p_quantity\":" + (qty.length() > 0 ? qty : "1");
    rpcBody += ",\"p_logged_at\":\"" + (ts.length() > 0 ? ts : "") + "\"";
    rpcBody += "}";

    String url = String(SUPABASE_URL) + "/rest/v1/rpc/insert_production_log";

    http.begin(url);
    http.addHeader("apikey", SUPABASE_ANON_KEY);
    http.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON_KEY));
    http.addHeader("Content-Type", "application/json");

    int httpCode = http.POST(rpcBody);
    if (httpCode == 200) {
      successCount++;
    } else {
      String resp = http.getString();
      Serial.print("Upload failed for one entry: HTTP ");
      Serial.print(httpCode);
      Serial.print(" ");
      Serial.println(resp);
    }
    http.end();

    startIdx = jsonBody.indexOf('{', endIdx + 1);
  }

  Serial.print("Synced ");
  Serial.print(successCount);
  Serial.print("/");
  Serial.print(count);
  Serial.println(" entries.");
  return successCount == count;
}

// Helper: extract a quoted string value from a JSON key
String extractJsonString(const String& json, const String& key) {
  String search = "\"" + key + "\":\"";
  int start = json.indexOf(search);
  if (start < 0) return "";
  start += search.length();
  int end = json.indexOf('"', start);
  if (end < 0) return "";
  return json.substring(start, end);
}

// Helper: extract a numeric value from a JSON key
String extractJsonNumber(const String& json, const String& key) {
  String search = "\"" + key + "\":";
  int start = json.indexOf(search);
  if (start < 0) return "";
  start += search.length();
  int end = json.indexOf(',', start);
  if (end < 0) end = json.indexOf('}', start);
  if (end < 0) return "";
  return json.substring(start, end);
}

// =====================================================================
// NVS — COUNTS
// =====================================================================
void loadCurrentCounts() {
  prefs.begin("boxcounter", false);
  String dayKey = "d" + String(currentSkuIndex) + currentDateCompact;
  String totalKey = "t" + String(currentSkuIndex);
  todayCount = prefs.getULong(dayKey.c_str(), 0);
  totalCount = prefs.getULong(totalKey.c_str(), 0);
  prefs.end();
}
void saveCurrentCounts() {
  prefs.begin("boxcounter", false);
  String dayKey = "d" + String(currentSkuIndex) + currentDateCompact;
  String totalKey = "t" + String(currentSkuIndex);
  prefs.putULong(dayKey.c_str(), todayCount);
  prefs.putULong(totalKey.c_str(), totalCount);
  prefs.end();
}
void saveSkuIndex() {
  prefs.begin("boxcounter", false);
  prefs.putUChar("skuIdx", (uint8_t)currentSkuIndex);
  prefs.end();
}
void loadSkuIndex() {
  prefs.begin("boxcounter", false);
  currentSkuIndex = prefs.getUChar("skuIdx", 0);
  prefs.end();
  if (currentSkuIndex >= SKU_COUNT) currentSkuIndex = 0;
}

// =====================================================================
// LED BLINK — SKU INDICATOR
// =====================================================================
void startBlinkSequence(int numBlinks) {
  blinkActive = true;
  blinksRemaining = numBlinks * 2;
  ledCurrentlyOn = false;
  digitalWrite(SKU_LED_PIN, LOW);
  lastBlinkToggle = millis();
}

void updateBlinkSequence() {
  if (!blinkActive) return;
  unsigned long now = millis();
  unsigned long interval = ledCurrentlyOn ? BLINK_ON_MS : BLINK_OFF_MS;
  if (now - lastBlinkToggle >= interval) {
    if (blinksRemaining <= 0) {
      blinkActive = false;
      digitalWrite(SKU_LED_PIN, LOW);
      return;
    }
    ledCurrentlyOn = !ledCurrentlyOn;
    digitalWrite(SKU_LED_PIN, ledCurrentlyOn ? HIGH : LOW);
    lastBlinkToggle = now;
    blinksRemaining--;
  }
}

// =====================================================================
// LED — INTERNET STATUS
// =====================================================================
void updateNetLed() {
  unsigned long now = millis();
  NetState target;

  if (WiFi.status() == WL_CONNECTED) {
    target = NET_CONNECTED;
  } else if (WiFi.status() == WL_DISCONNECTED || WiFi.status() == WL_IDLE_STATUS) {
    target = NET_CONNECTING;
  } else {
    target = NET_OFF;
  }

  if (target != currentNetState) {
    currentNetState = target;
    switch (target) {
      case NET_OFF:
        digitalWrite(NET_LED_PIN, LOW);
        break;
      case NET_CONNECTING:
        digitalWrite(NET_LED_PIN, LOW);
        netLedOn = false;
        lastNetBlinkToggle = now;
        break;
      case NET_CONNECTED:
        digitalWrite(NET_LED_PIN, HIGH);
        break;
    }
  }

  if (target == NET_CONNECTING) {
    if (now - lastNetBlinkToggle >= 500) {
      netLedOn = !netLedOn;
      digitalWrite(NET_LED_PIN, netLedOn ? HIGH : LOW);
      lastNetBlinkToggle = now;
    }
  }
}

// =====================================================================
// WIFI
// =====================================================================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  for (int i = 0; i < WIFI_NETWORK_COUNT; i++) {
    const char* ssid = WIFI_NETWORKS[i][0];
    const char* pass = WIFI_NETWORKS[i][1];

    Serial.print("\nTrying WiFi: ");
    Serial.println(ssid);
    WiFi.begin(ssid, pass);

    unsigned long startAttempt = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 15000) {
      delay(500);
      Serial.print(".");
    }

    if (WiFi.status() == WL_CONNECTED) {
      currentWifiIndex = i;
      Serial.print("\nWiFi connected via: ");
      Serial.print(ssid);
      Serial.print(" | IP: ");
      Serial.println(WiFi.localIP().toString());
      return;
    }
  }

  Serial.println("\nAll WiFi networks failed. Will retry in background.");
}

// Called in loop when WiFi is disconnected — tries the next network
// in the list (round-robin) so it doesn't get stuck on one.
void tryNextWiFi() {
  currentWifiIndex = (currentWifiIndex + 1) % WIFI_NETWORK_COUNT;
  const char* ssid = WIFI_NETWORKS[currentWifiIndex][0];
  const char* pass = WIFI_NETWORKS[currentWifiIndex][1];
  Serial.print("Trying next WiFi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, pass);
}

// =====================================================================
// NTP TIME SYNC
// =====================================================================
void syncRtcFromNtp() {
  configTime(TZ_OFFSET_HOURS * 3600 + TZ_OFFSET_MINUTES * 60, 0, NTP_SERVER1, NTP_SERVER2);

  Serial.print("Fetching NTP time...");
  struct tm timeinfo;
  int retries = 0;
  while (!getLocalTime(&timeinfo) && retries < 10) {
    delay(500);
    Serial.print(".");
    retries++;
  }

  if (getLocalTime(&timeinfo)) {
    DateTime ntpTime(
      timeinfo.tm_year + 1900,
      timeinfo.tm_mon + 1,
      timeinfo.tm_mday,
      timeinfo.tm_hour,
      timeinfo.tm_min,
      timeinfo.tm_sec
    );
    rtc.adjust(ntpTime);
    Serial.print("\nRTC synced from NTP: ");
    Serial.println(formatTimestamp(ntpTime));
  } else {
    Serial.println("\nNTP sync failed — RTC keeps previous time.");
  }
}

// =====================================================================
// ULTRASONIC
// =====================================================================
float readRawDistanceCM() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  if (duration == 0) return -1;
  return duration * 0.0343 / 2.0;
}

float getFilteredDistanceCM() {
  float raw = readRawDistanceCM();
  if (raw < 0) return -1;
  distanceBuffer[filterIndex] = raw;
  filterIndex = (filterIndex + 1) % FILTER_SAMPLES;
  if (filterIndex == 0) filterFilled = true;
  int count = filterFilled ? FILTER_SAMPLES : filterIndex;
  float sum = 0;
  for (int i = 0; i < count; i++) sum += distanceBuffer[i];
  return sum / count;
}
