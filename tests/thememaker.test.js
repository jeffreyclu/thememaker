import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { JSDOM } from "jsdom"

import Thememaker from "../src/thememaker";

import { modes, htmlElements, generateUiSchema } from "../src/config";
import { mockScheme, mockColorArr, mockSchemeDetails, mockResponse, mockUrl, mockJsonUrl, mockHtmlUrl } from "./mocks";

describe("Thememaker", () => {
    const dom = new JSDOM();
    
    const uiSchema = generateUiSchema();
    const selectors = uiSchema.map((obj) => `#${obj.properties.id}`);

    global.document = dom.window.document;
    global.window = dom.window;
    global.localStorage = {
        data: {},
        getItem(key) {
            return this.data[key];
        },
        setItem(key, value) {
            this.data[key] = value;
        },
        removeItem(key) {
            delete this.data[key];
        }
    };

    global.fetch = async () => Promise.resolve({
        json: () => Promise.resolve(mockResponse),
    });

    global.alert = jest.fn();

    let themeMaker;

    beforeEach(() => {
        themeMaker = new Thememaker(modes, htmlElements);
    });
    afterEach(() => {
        global.document.head.innerHTML = "";
        global.document.body.innerHTML = "";
        localStorage.data = {};
    })
    it("throws an error with invalid arguments", () => {
        const noArgs = () => new Thememaker();
        expect(noArgs).toThrow("modes must be an array");

        const firstBadArg = () => new Thememaker("a");
        expect(firstBadArg).toThrow("modes must be an array");

        const firstEmptyArg = () => new Thememaker([]);
        expect(firstEmptyArg).toThrow("modes must contain at least one value");

        const secondBadArg = () => new Thememaker(["a"], "b");
        expect(secondBadArg).toThrow("htmlElements must be an object");

        const secondEmptyArg = () => new Thememaker(["a"], {});
        expect(secondEmptyArg).toThrow("htmlElements must contain at least one value");

        const secondInvalidArg = () => new Thememaker(["a"], { b: "c" });
        expect(secondInvalidArg).toThrow("htmlElements values must be arrays");
    });

    it("constructs an instance when valid args are passed", () => {
        expect(themeMaker).toBeDefined();
        expect(themeMaker.modes).toBe(modes);
        expect(themeMaker.htmlElements).toBe(htmlElements);
    });

    it("calling randomNum generates a random num", () => {
        expect(themeMaker.randomNum(1,10)).toBeTruthy();
    });

    it("calling randomHexColor generates a random hex", () => {
        expect(themeMaker.randomHexColor()).toBeTruthy();
    });

    it("calling random mode returns a random mode", () => {
        expect(themeMaker.randomMode()).toBeTruthy();
        expect(modes).toContain(themeMaker.randomMode());
    });

    it("calling calculateTotalColors returns a number", () => {
        expect(themeMaker.calculateTotalColors()).toBe(Object.values(htmlElements).length);
    });

    it("calling generateColorApiUrl should generate a valid url", () => {
        expect(themeMaker.generateColorApiUrl(mockSchemeDetails, "json")).toBe(mockJsonUrl);
        expect(themeMaker.generateColorApiUrl(mockSchemeDetails, "html")).toBe(mockHtmlUrl);
    });

    it("calling fetchColors should return an array of hex strings", () => {
        themeMaker.applySchemeDetails(mockSchemeDetails);
        return themeMaker.fetchColors(mockUrl)
            .then(data => {
                expect(data).toBeTruthy();
                expect(data).toHaveLength(7);
            });
    });

    it("calling isContainerElement should return a boolean", () => {
        expect(themeMaker.isContainerElement("body")).toBeTruthy();
        expect(themeMaker.isContainerElement("a")).toBeFalsy();
    });

    it("calling isTextElement should return a boolean", () => {
        expect(themeMaker.isTextElement("body")).toBeFalsy();
        expect(themeMaker.isTextElement("a")).toBeTruthy();
    });

    it("calling applySchemeDetails should set schemeDetails in state", () => {
        themeMaker.applySchemeDetails(mockSchemeDetails);
        expect(themeMaker.scheme).toStrictEqual({ schemeDetails: mockSchemeDetails })
    });

    it("calling generate scheme should generate a scheme", () => {
        themeMaker.applySchemeDetails(mockSchemeDetails);
        expect(themeMaker.generateScheme(mockColorArr)).toStrictEqual(mockScheme);
    });

    it("calling apply scheme applies the scheme", () => {
        expect(document.head.childElementCount).toBe(0);
        themeMaker.initialize();
        themeMaker.applyScheme(mockScheme);
        expect(document.head.childElementCount).toBe(1);
    });

    it("calling applySavedScheme should do nothing if no scheme is saved", () => {
        themeMaker.applySavedScheme();
        expect(themeMaker.scheme).toBeNull();
    })

    it("calling applySavedScheme should apply a scheme saved in localStorage", () => {
        localStorage.setItem("savedScheme", JSON.stringify(mockScheme));
        themeMaker.generateUi();
        themeMaker.applySavedScheme();
        expect(themeMaker.scheme).toStrictEqual(mockScheme);
    });

    it("calling enqueueScheme should add a scheme to scheme history", () => {
        themeMaker.enqueueScheme(mockScheme);
        expect(themeMaker.schemeHistory).toHaveLength(1);
    });

    it("calling dequeueScheme should return the scheme at the passed index", () => {
        expect(themeMaker.dequeueScheme(0)).toStrictEqual({});
        expect(themeMaker.schemeHistory).toHaveLength(0);
        themeMaker.enqueueScheme(mockScheme);
        expect(themeMaker.schemeHistory).toHaveLength(1);
        expect(themeMaker.dequeueScheme(0)).toStrictEqual(mockScheme);
        expect(themeMaker.schemeHistory).toHaveLength(1);
    });

    it("calling generateUi should generate the ui", () => {
        expect(document.body.childElementCount).toBe(0);
        themeMaker.generateUi();
        expect(document.body.childElementCount).toBe(uiSchema.length);
        selectors.forEach((selector) => {
            if (selector === "#generateSchemeButton") {
                expect(document.querySelector(selector).style.display).toBe("block");
            } else {
                expect(document.querySelector(selector).style.display).toBe("none");
            }
            expect(document.querySelector(selector)).toBeTruthy();
        })
    });

    it("calling updateUi should do nothing if no scheme is applied", () => {
        themeMaker.initialize();
        expect(document.body.childElementCount).toBe(uiSchema.length);
        selectors.forEach((selector) => {
            if (selector === "#generateSchemeButton") {
                expect(document.querySelector(selector).style.display).toBe("block");
            } else {
                expect(document.querySelector(selector).style.display).toBe("none");
            }
            expect(document.querySelector(selector)).toBeTruthy();
        });

        themeMaker.updateUi();
        expect(document.body.childElementCount).toBe(uiSchema.length);
        selectors.forEach((selector) => {
            if (selector === "#generateSchemeButton") {
                expect(document.querySelector(selector).style.display).toBe("block");
            } else {
                expect(document.querySelector(selector).style.display).toBe("none");
            }
            expect(document.querySelector(selector)).toBeTruthy();
        });
    })

    it("calling updateUi should update the ui when a scheme is applied", () => {
        themeMaker.initialize();
        themeMaker.applyScheme(mockScheme);
        themeMaker.updateUi();
        selectors.forEach((selector) => {
            if (
                selector === "#generateSchemeButton" ||
                selector === "#saveSchemeButton" ||
                selector === "#resetSchemeButton" ||
                selector === "#showDetailsButton"
                ) {
                expect(document.querySelector(selector).style.display).toBe("block");
            } else {
                expect(document.querySelector(selector).style.display).toBe("none");
            }
            expect(document.querySelector(selector)).toBeTruthy();
        });
    });

    it("calling renderSchemeDetails should render the scheme details in the scheme details panel", () => {
        expect(document.querySelector("#schemeDetailsPanel")).toBeNull();
        themeMaker.initialize();
        themeMaker.renderSchemeDetails(mockScheme);
        expect(document.querySelector("#schemeDetailsPanel").childElementCount).toBe(Object.values(htmlElements).length + 1);
    })

    it("calling renderSchemeHistory should render just the title in the scheme history panel with no scheme history", () => {
        expect(document.querySelector("#schemeHistoryPanel")).toBeNull();
        themeMaker.initialize();
        themeMaker.renderSchemeHistory(mockScheme);
        expect(document.querySelector("#schemeHistoryPanel").childElementCount).toBe(1);
    })

    it("calling renderSchemeHistory should render the scheme history in the scheme history panel with no scheme history", () => {
        expect(document.querySelector("#schemeHistoryPanel")).toBeNull();
        themeMaker.initialize();
        themeMaker.enqueueScheme(mockScheme);
        themeMaker.renderSchemeHistory(mockScheme);
        expect(document.querySelector("#schemeHistoryPanel").childElementCount).toBe(2);
    });

    it("calling handleGenerateScheme should generate a scheme and apply it", async () => {
        expect(document.head.childElementCount).toBe(0);
        themeMaker.initialize();
        return themeMaker.handleGenerateScheme()
            .then(() => {
                expect(themeMaker.scheme).toBeTruthy();
                expect(document.head.childElementCount).toBe(1);
            });
    });

    it("calling handleSaveScheme should save a scheme in localStorage", () => {
        expect(localStorage.getItem("savedScheme")).toBeUndefined();
        themeMaker.initialize();
        themeMaker.applyScheme(mockScheme);
        themeMaker.handleSaveScheme();
        expect(alert).toHaveBeenCalled();
        expect(JSON.parse(localStorage.getItem("savedScheme"))).toStrictEqual(mockScheme);
    });

    it("calling handleResetScheme should delete the saved scheme and reset the scheme", () => {
        themeMaker.initialize();
        themeMaker.applyScheme(mockScheme);
        themeMaker.handleSaveScheme();
        themeMaker.handleResetScheme();
        expect(alert).toHaveBeenCalled();
        expect(localStorage.getItem("savedScheme")).toBeUndefined();
        expect(themeMaker.scheme).toBeNull();
    });

    it("calling handleShowDetails should make the schemeDetailsPanel visible", () => {
        themeMaker.initialize();
        themeMaker.handleGenerateScheme();
        expect(themeMaker.showDetails).toBeFalsy();
        expect(document.querySelector("#schemeDetailsPanel").style.display).toBe("none");
        themeMaker.handleShowDetails();
        expect(themeMaker.showDetails).toBeTruthy();
        expect(document.querySelector("#schemeDetailsPanel").style.display).toBe("flex");
    });

    it("calling handleHideDetails should hide the schemeDetailsPanel", () => {
        themeMaker.initialize();
        themeMaker.handleGenerateScheme();
        expect(themeMaker.showDetails).toBeFalsy();
        expect(document.querySelector("#schemeDetailsPanel").style.display).toBe("none");
        themeMaker.handleShowDetails();
        expect(themeMaker.showDetails).toBeTruthy();
        expect(document.querySelector("#schemeDetailsPanel").style.display).toBe("flex");
        themeMaker.handleHideDetails();
        expect(themeMaker.showDetails).toBeFalsy();
        expect(document.querySelector("#schemeDetailsPanel").style.display).toBe("none");
    });

    it("calling handleShowHistory should make the schemeHistoryPanel visible", () => {
        themeMaker.initialize();
        themeMaker.enqueueScheme(mockScheme);
        expect(themeMaker.showHistory).toBeFalsy();
        expect(document.querySelector("#schemeHistoryPanel").style.display).toBe("none");
        themeMaker.handleShowHistory();
        expect(themeMaker.showHistory).toBeTruthy();
        expect(document.querySelector("#schemeHistoryPanel").style.display).toBe("flex");
    });

    it("calling handleHideHistory should hide the schemeHistoryPanel", () => {
        themeMaker.initialize();
        themeMaker.enqueueScheme(mockScheme);
        expect(themeMaker.showHistory).toBeFalsy();
        expect(document.querySelector("#schemeHistoryPanel").style.display).toBe("none");
        themeMaker.handleShowHistory();
        expect(themeMaker.showHistory).toBeTruthy();
        expect(document.querySelector("#schemeHistoryPanel").style.display).toBe("flex");
        themeMaker.handleHideHistory();
        expect(themeMaker.showHistory).toBeFalsy();
        expect(document.querySelector("#schemeHistoryPanel").style.display).toBe("none");
    });

    it("calling initialize should generate the UI only when no scheme is saved", () => {
        expect(document.body.childElementCount).toBe(0);
        themeMaker.initialize();
        expect(document.body.childElementCount).toBe(uiSchema.length);
        selectors.forEach((selector) => {
            if (selector === "#generateSchemeButton") {
                expect(document.querySelector(selector).style.display).toBe("block");
            } else {
                expect(document.querySelector(selector).style.display).toBe("none");
            }
            expect(document.querySelector(selector)).toBeTruthy();
        });
        expect(themeMaker.scheme).toBeNull();
    });

    it("calling initialize should generate the UI and apply the saved scheme if a scheme is saved", () => {
        localStorage.setItem("savedScheme", JSON.stringify(mockScheme));
        expect(document.body.childElementCount).toBe(0);
        themeMaker.initialize();
        expect(document.body.childElementCount).toBe(uiSchema.length);
        selectors.forEach((selector) => {
            if (
                selector === "#generateSchemeButton" ||
                selector === "#saveSchemeButton" ||
                selector === "#resetSchemeButton" ||
                selector === "#showDetailsButton" ||
                selector === "#showHistoryButton"
                ) {
                expect(document.querySelector(selector).style.display).toBe("block");
            } else {
                expect(document.querySelector(selector).style.display).toBe("none");
            }
            expect(document.querySelector(selector)).toBeTruthy();
        });
        expect(themeMaker.scheme).toStrictEqual(mockScheme);
    })
})