import { generateUiSchema } from "./config.js";

export default class Thememaker {
    /**
     * 
     * @param {String[]} modes an array of color modes
     * @param {String[]} htmlElements an array of html element types
     */
    constructor(modes, htmlElements) {
        if (!Array.isArray(modes)) {
            throw new Error("modes must be an array");
        }
        if (!modes.length) {
            throw new Error ("modes must contain at least one value");
        }
        if (typeof htmlElements !== "object") {
            throw new Error("htmlElements must be an object");
        }
        if (!Object.values(htmlElements).length) {
            throw new Error("htmlElements must contain at least one value");
        }
        if (!Object.values(htmlElements).filter((element) => Array.isArray(element)).length) {
            throw new Error("htmlElements values must be arrays");
        }

        this.scheme = null;
        this.modes = modes;
        this.htmlElements = htmlElements;
        this.showDetails = false;
        this.showHistory = false;
        this.schemeHistory = [];
    }

    /**
     * 
     * @param {Number} min minimum number for calculation
     * @param {Number} max maximum number for calculation
     * @returns a random integer between min and max arguments
     */
    randomNum = (min, max) => {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * 
     * @returns a string representing a random hexadecimal color
     */
    randomHexColor = () => {
        return Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    }

    /**
     * 
     * @returns a string representing a random color mode for the color api
     */
    randomMode = () => {
        return this.modes[this.randomNum(0, this.modes.length - 1)];
    }

    /**
     * 
     * @returns an integer representing the number of total colors for THEMEMAKER
     */
    calculateTotalColors = () => {
        return Object.keys(this.htmlElements).length;
    }

    /**
     * 
     * @param {string} format 
     * @returns a string representing a valid color api url
     */
    generateColorApiUrl = (schemeDetails, format) => {
    const { rootColor, colorMode } = schemeDetails;
    const totalColors = this.calculateTotalColors();
    return "https://www.thecolorapi.com/scheme"
        +`?hex=${rootColor}&mode=${colorMode}`
        +`&format=${format}&count=${totalColors}`;
}
    
    /**
     * 
     * @param {String} colorApiUrl 
     * @returns an array of hexadecimal color strings from the given color api url
     */
    fetchColors = async (colorApiUrl) => {
        try {
            const generatedColors = [];

            const resp = await fetch(colorApiUrl);
            const data = await resp.json();

            if (!data.colors) { 
                throw new Error("invalid color data");
            };

            data?.colors.forEach(colorObj=>{
                generatedColors.push(colorObj?.hex?.value);
            })

            const newDetails = {
                ...this.scheme.schemeDetails,
                rootColorName: data?.seed?.name?.value
            };

            this.applySchemeDetails(newDetails);

            return generatedColors;
        } catch (e) {
            console.error(e);
        }
    }

    /**
     * 
     * @param {string} element 
     * @returns a boolean representing if the element is a container element
     */
    isContainerElement = (element) => {
        return this.htmlElements.darkContainer.includes(element) ||
            this.htmlElements.mediumContainer.includes(element) ||
            this.htmlElements.lightContainer.includes(element)
    }

    /**
     * 
     * @param {string} element 
     * @returns a boolean representing if the element is a text element
     */
    isTextElement = (element) => {
        return this.htmlElements.darkText.includes(element) ||
        this.htmlElements.mediumText.includes(element) ||
        this.htmlElements.lightText.includes(element)
    }
    
    /**
     * 
     * @param {{}} schemeDetails 
     */
    applySchemeDetails = (schemeDetails) => {
        this.scheme = {
            schemeDetails: {
                ...schemeDetails
            }
        };
    }

    /**
     * 
     * @param {[]} colorArr 
     * @returns an object describing a color scheme of html element: color key/value pairs
     * -> {"body": "color1", "p": "color2", etc.}
     */
    generateScheme = (colorArr) => {
        const colorScheme = {
            ...this.scheme
        };

        const elements = Object.values(this.htmlElements);

        const totalColors = this.calculateTotalColors();

        for (let i = 0; i < totalColors; i += 1) {
            const elementArr = elements[i];
            const color = colorArr[i];

            elementArr.forEach((element) => {
                colorScheme[element] = color;
            })
        }

        return colorScheme;
    }

    /**
     * applies the color scheme
     */
    applyScheme = (scheme) => {
        this.scheme = scheme;

        let schemeStyle = "";
        for (const [key, value] of Object.entries(scheme)) {
            if (key === "schemeDetails") {
                continue;
            }
            if (this.isContainerElement(key)) {
                schemeStyle += `${key} { color: ${scheme["p"]} !important; background-color: ${value} !important; }`;
            } else {
                schemeStyle += `${key} { color: ${value} !important; background-color: transparent !important; background-image: none !important; }`;
            } 
        }

        // hardcode thememaker UI colors otherwise the theme will override it 🥲
        schemeStyle += "#generateSchemeButton { background-color: #FFFFFF !important; color: #000000 !important; }";
        schemeStyle += "#saveSchemeButton { background-color: #FFFFFF !important; color: #000000 !important; }";
        schemeStyle += "#resetSchemeButton { background-color: #FFFFFF !important; color: #000000 !important; }";
        schemeStyle += "#showDetailsButton { background-color: #FFFFFF !important; color: #000000 !important; }";
        schemeStyle += "#hideDetailsButton { background-color: #FFFFFF !important; color: #000000 !important; }";
        schemeStyle += "#showHistoryButton { background-color: #FFFFFF !important; color: #000000 !important; }";
        schemeStyle += "#hideHistoryButton { background-color: #FFFFFF !important; color: #000000 !important; }";
        schemeStyle += `#schemeDetailsPanel { background-color: #FFFFFF !important; }`;
        schemeStyle += `#schemeHistoryPanel { background-color: #FFFFFF !important; }`;

        // reset existing scheme from head
        const head = document.querySelector("head");
        const oldScheme = document.querySelector("#themeMaker");
        if (oldScheme) { 
            head.removeChild(oldScheme);
        };

        // inject the new style element with the theme styles
        const newStyle = document.createElement("style");
        newStyle.id = "themeMaker";
        newStyle.innerText = schemeStyle;
        head.appendChild(newStyle);

        this.updateUi();
    }

    /**
     * retrieve and apply the saved scheme
     */
    applySavedScheme = () => {
        if (!localStorage.getItem("savedScheme")) {
            return;
        }

        const retrievedScheme = JSON.parse(localStorage.getItem("savedScheme"));

        if (!retrievedScheme.hasOwnProperty("schemeDetails")) {
            localStorage.removeItem("savedScheme");
            return;
        };

        this.enqueueScheme(retrievedScheme);
        this.applyScheme(retrievedScheme);
        
        this.updateUi();
    }

    /**
     * 
     * @param {{}} scheme 
     * enqueues the passed in scheme
     */
    enqueueScheme = (scheme) => {
        this.schemeHistory.push(scheme);
        if (this.schemeHistory.length > 10) {
            this.schemeHistory.shift();
        }
    }

    /**
     * 
     * @param {number} index 
     * @returns the stored scheme at the passed in index
     */
    dequeueScheme = (index) => {
        if (!this.schemeHistory.length) {
            return {};
        }
        let selectedScheme = {};
        if (index >= 0 && index < this.schemeHistory.length) {
            selectedScheme = this.schemeHistory[index];
        }
        return selectedScheme;
    }

    /**
     * generates the UI and binds the click handlers for THEMEMAKER
     */
    generateUi = () => {
        const uiSchema = generateUiSchema(
            this.handleGenerateScheme,
            this.handleSaveScheme,
            this.handleResetScheme,
            this.handleShowDetails,
            this.handleHideDetails,
            this.handleShowHistory,
            this.handleHideHistory,
        )
        
        const docBody = document.querySelector("body");
        
        uiSchema.forEach((schema) => {
            // create an html node, override its properties with
            // the UI schema, and append it to the body
            const element = document.createElement(schema.type);
            for (const [key, value] of Object.entries(schema.properties)) {
                // handle style property separately since its an {}
                if (key === "style") {
                    for (const [styleKey, styleValue] of Object.entries(value)) {
                        element.style[styleKey] = styleValue;
                    }
                } else {
                    element[key] = value;
                }
            }
            docBody.appendChild(element);
        });
    }

    /**
     * update the Thememaker UI based on state
     */
    updateUi = () => {
        if (!this.scheme) {
            return;
        }
        document.querySelector("#saveSchemeButton").style.display = "block";
        document.querySelector("#resetSchemeButton").style.display = "block";
        document.querySelector("#showDetailsButton").style.display = this.showDetails ? "none" : "block";
        document.querySelector("#hideDetailsButton").style.display = this.showDetails ? "block" : "none";

        if (this.schemeHistory.length) {
            document.querySelector("#showHistoryButton").style.display = this.showHistory ? "none" : "block";
            document.querySelector("#hideHistoryButton").style.display = this.showHistory ? "block" : "none";
            this.renderSchemeHistory();
        }
        
        this.renderSchemeDetails(this.scheme);
    }

    /**
     * applies the color scheme details to the details panel
     */
    renderSchemeDetails = (scheme) => {
        const { rootColorName, colorMode } = scheme.schemeDetails;
        const colorApiUrl = this.generateColorApiUrl(scheme.schemeDetails, "html");

        let colorSchemeInfo = `
            <p>
                <span style="color: #000000 !important;">
                    ${rootColorName} (${colorMode})
                </span> 
                <a style="color: #000000 !important; text-decoration: underline;" href=${colorApiUrl}>link</a>
            </p>
        `;
    
        const reversedScheme = {};

        for (let [key, value] of Object.entries(scheme)) {
            if (key === "schemeDetails") {
                continue;
            }
            if (!reversedScheme[value]) {
                reversedScheme[value] = [];
            }
            reversedScheme[value].push(key);
        }

        for (let [key, value] of Object.entries(reversedScheme)) {
            const reducedValue = value.reduce((prev, curr, idx, arr) => {
                if (idx === arr.length - 1) {
                    return prev += curr;
                }
                return prev += curr + ","
            }, "");

            let newP = `
                <p style="color: #000000 !important">
                    ${reducedValue}: <span style="color: ${key === "#FFFFFF" ? "#000000" : key} !important">${key}</span>
                </p>
            `;
            colorSchemeInfo += newP;
        }
    
        const schemeDetailsPanel = document.querySelector("#schemeDetailsPanel");
        schemeDetailsPanel.innerHTML = colorSchemeInfo;
    }
    
    /**
     * applies the scheme history to the scheme history panel
     */
    renderSchemeHistory = () => {
        const schemeHistoryPanel = document.querySelector("#schemeHistoryPanel");
        schemeHistoryPanel.innerHTML = "";
        
        const header = document.createElement("p");
        header.innerHTML = `
            <span style="color: #000000 !important; text-decoration: underline">
                Scheme History
            </span>
        `;

        schemeHistoryPanel.appendChild(header);

        this.schemeHistory.forEach((scheme, i) => {
            const { rootColorName, colorMode } = scheme.schemeDetails;

            const applyHistory = () => {
                this.applyScheme(scheme);
                this.renderSchemeDetails(scheme);
            }

            const newP = document.createElement("p");
            newP.innerHTML = `
                <span style="color: #000000 !important">
                    ${i + 1}.${rootColorName} (${colorMode})
                </span>
            `;
            newP.onclick = applyHistory;
            
            schemeHistoryPanel.appendChild(newP);
        })
    }

    /**
     * click handler to generate a scheme
     */
    handleGenerateScheme = async () => {
        const seedDetails = {
            rootColor: this.randomHexColor(),
            colorMode: this.randomMode()
        }

        this.applySchemeDetails(seedDetails);

        const colorApiUrl = this.generateColorApiUrl(seedDetails, "json");

        const fetchedColors = await this.fetchColors(colorApiUrl);

        const generatedScheme = this.generateScheme(fetchedColors);
        
        this.enqueueScheme(generatedScheme);

        this.applyScheme(generatedScheme);

        this.renderSchemeDetails(generatedScheme);

        this.updateUi();
    }

    /**
     * click handler to save a scheme to localStorage
     */
    handleSaveScheme = () => {
        localStorage.setItem("savedScheme", JSON.stringify(this.scheme));
        alert("Success, color scheme saved.");
    }
    
    /**
     * click handler to delete a scheme from localStorage and force a page refresh
     */
    handleResetScheme = () => {
        localStorage.removeItem("savedScheme");
        localStorage.removeItem("schemeDetails");
        alert("Scheme reset.")
        const head = document.querySelector("head");
        const oldScheme = document.querySelector("#themeMaker");
        if (oldScheme) { 
            head.removeChild(oldScheme);
        };
        this.scheme = null;
    }

    /**
     * click handler to show the details panel
     */
    handleShowDetails = () => {
        const schemeDetails = document.querySelector("#schemeDetailsPanel")
        schemeDetails.style.display = "flex";
        schemeDetails.style.flexFlow = "column";
        this.showDetails = true;
        this.updateUi();
    }

    /**
     * click handler to hide the details panel
     */
    handleHideDetails = () => {
        const schemeDetails = document.querySelector("#schemeDetailsPanel")
        schemeDetails.style.display = "none";
        this.showDetails = false;
        this.updateUi();
    }

    /**
     * click handler to show the scheme history panel
     */
    handleShowHistory = () => {
        const schemeHistory = document.querySelector("#schemeHistoryPanel");
        schemeHistory.style.display = "flex";
        schemeHistory.style.flexFlow = "column";
        this.showHistory = true;
        this.updateUi();
    }

    /**
     * click handler to hide the scheme history panel
     */
    handleHideHistory = () => {
        const schemeHistory = document.querySelector("#schemeHistoryPanel");
        schemeHistory.style.display = "none";
        this.showHistory = false;
        this.updateUi();
    }

    /**
     * initialize THEMEMAKER
     */
    initialize = () => {
        this.generateUi();
        this.applySavedScheme();
    }
}

// let user add their own dom node types