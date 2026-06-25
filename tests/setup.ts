/**
 * Global Vitest setup: install a fake `chrome.*` before every test so no test
 * ever touches real browser APIs, register jest-dom matchers, and unmount any
 * React trees after each test so component tests don't leak DOM into the next.
 */
import { afterEach, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";

import { installChromeMock } from "./chrome-mock";

installChromeMock();

beforeEach(() => {
  installChromeMock();
});

afterEach(() => {
  cleanup();
});
