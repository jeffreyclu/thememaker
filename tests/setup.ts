/**
 * Global Vitest setup: install a fake `chrome.*` before every test so no test
 * ever touches real browser APIs.
 */
import { beforeEach } from "vitest";

import { installChromeMock } from "./chrome-mock";

installChromeMock();

beforeEach(() => {
  installChromeMock();
});
