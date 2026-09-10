// react-native-receive-sharing-intent@2 ships android/build.gradle with
// jcenter(), which no longer exists in Gradle 7+. Replace it with
// mavenCentral() right after npm install. (Run via the postinstall script.)
const fs = require("fs");
const path = require("path");

const target = path.join(
  __dirname,
  "..",
  "node_modules",
  "react-native-receive-sharing-intent",
  "android",
  "build.gradle",
);

try {
  if (fs.existsSync(target)) {
    const src = fs.readFileSync(target, "utf8");
    if (src.includes("jcenter()")) {
      fs.writeFileSync(target, src.split("jcenter()").join("mavenCentral()"), "utf8");
      console.log("[patch] react-native-receive-sharing-intent: jcenter() -> mavenCentral()");
    }
  }
} catch {
  // never break installs
}
