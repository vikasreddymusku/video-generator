import { config } from "@remotion/eslint-config-flat";

export default [
  ...config,
  {
    files: ["src/web/**/*.{ts,tsx}"],
    // Browser UI media are independent of Remotion compositions.
    rules: { "@remotion/warn-native-media-tag": "off" },
  },
];
