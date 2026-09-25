// Node 24 on some Windows systems can fail os.userInfo() before tsx starts.
// Keep the test/runtime loader usable without changing application behavior.
const os = require("node:os");
try {
  os.userInfo();
} catch {
  os.userInfo = () => ({ username: process.env.USERNAME || "local" });
}