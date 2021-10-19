class Thememaker {
    /**
     * 
     * @param {String[]} modes an array of color modes
     * @param {String[]} htmlElements an array of html element types
     */
    constructor(modes, htmlElements) {
        this.rootColor = "";
        this.rootColorName = "";
        this.colorMode = "";
        this.colorScheme = {};
        this.modes = modes;
        this.htmlElements = htmlElements;
        this.showDetails = false;
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
        return Math.floor(Math.random()*16777215).toString(16);
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
     * @returns an integer representing the number of total colors for thememaker
     */
    calculateTotalColors = () => {
        return Object.keys(this.htmlElements).length;
    }
    
    /**
     * 
     * @param {String} colorApiUrl 
     * @returns an array of hexadecimal color strings from the given color api url
     */
    fetchColors = async (colorApiUrl) => {
        const generatedColors = [];
        console.info("fetching:", this.rootColor, this.colorMode);

        const resp = await fetch(colorApiUrl);
        const data = await resp.json();

        if (!data.colors) { 
            throw new Error("Error, invalid color data");
        };

        data?.colors.forEach(colorObj=>{
            generatedColors.push(colorObj?.hex?.value);
        })

        this.rootColorName = data?.seed?.name?.value;

        return generatedColors;
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
     * @param {[]} colorArr 
     * @returns an object describing a color scheme of html element: color key/value pairs
     * -> {"body": "color1", "p": "color2", etc.}
     */
    generateScheme = (colorArr) => {
        const colorScheme = {};

        const elements = Object.values(this.htmlElements);

        const totalColors = this.calculateTotalColors();

        for (let i = 0; i < totalColors; i += 1) {
            const elementArr = elements[i];
            const color = colorArr[i];

            elementArr.forEach((element) => {
                if (colorArr[0] === "#000000") {
                    if (this.isTextElement(element)) {
                        colorScheme[element] = "#FFFFFF"
                    } else {
                        colorScheme[element] = color;
                    }
                } else {
                    colorScheme[element] = color;
                }
            })
        }

        return colorScheme;
    }

    /**
     * 
     * applies the color scheme
     */
    applyScheme = () => {
        let schemeStyle = "";
        for (const [key, value] of Object.entries(this.scheme)) {
            if (this.isContainerElement(key)) {
                schemeStyle += `${key} { color: ${this.scheme["p"]} !important; background-color: ${value} !important; }`;
            } else {
                schemeStyle += `${key} { color: ${value} !important; background-color: transparent !important; background-image: none !important; }`;
            }
        }

        // hardcode thememaker UI colors
        schemeStyle += "#generateSchemeButton { background-color: #FFFFFF !important; color: #000000 !important; }";
        schemeStyle += "#saveSchemeButton { background-color: #FFFFFF !important; color: #000000 !important; }";
        schemeStyle += "#resetSchemeButton { background-color: #FFFFFF !important; color: #000000 !important; }";
        schemeStyle += "#showDetailsButton { background-color: #FFFFFF !important; color: #000000 !important; }";
        schemeStyle += "#hideDetailsButton { background-color: #FFFFFF !important; color: #000000 !important; }";
        schemeStyle += `#schemeDetailsPanel { background-color: #FFFFFF !important; }`;

        // inject the new style element with the theme styles
        const head = document.querySelector("head");
        const newStyle = document.createElement("style");
        newStyle.innerText = schemeStyle;
        head.appendChild(newStyle);

        this.updateUi();
    }

    /**
     * applies the color scheme details to the details panel
     */
    renderSchemeDetails = () => {
        const colorApiUrl = this.generateColorApiUrl("html");

        let colorSchemeInfo = `<p><a style="color: #000000 !important; text-decoration: underline;" href=${colorApiUrl}>${this.rootColorName} (${this.colorMode})</a></p>`
    
        for (let [key, value] of Object.entries(this.scheme)) {
            // TODO: color the value
            let newP = `<p style="color: #000000 !important">${key}: <span style="color: ${value} !important">${value}</span></p>`;
            colorSchemeInfo += newP;
        }
    
        const schemeDetailsPanel = document.querySelector("#schemeDetailsPanel");
    
        schemeDetailsPanel.innerHTML = colorSchemeInfo;
    }

    /**
     * 
     * @param {string} format 
     * @returns a string representing a valid color api url
     */
    generateColorApiUrl = (format) => {
        const totalColors = this.calculateTotalColors();
        return `//www.thecolorapi.com/scheme?hex=${this.rootColor}&mode=${this.colorMode}&format=${format}&count=${totalColors}`;
    }

    /**
     * click handler to generate a scheme
     */
    handleGenerateScheme = async () => {
        // generate a mode and a color
        this.colorMode = this.randomMode();
        this.rootColor = this.randomHexColor();

        // generate a url
        const colorApiUrl = this.generateColorApiUrl("json");

        // fetch data
        const fetchedColors = await this.fetchColors(colorApiUrl);

        // generate the scheme
        this.scheme = this.generateScheme(fetchedColors);

        // apply the scheme
        this.applyScheme();

        // apply the details to the details panel;
        this.renderSchemeDetails();

        // update the UI
        this.updateUi();
    }

    /**
     * click handler to save a scheme to localStorage
     */
    handleSaveScheme = () => {
        localStorage.setItem("savedScheme", JSON.stringify(this.scheme));
        this.saveSchemeDetails();
        alert("Success, color scheme saved.");
    }
    
    /**
     * click handler to delete a scheme from localStorage and force a page refresh
     */
    handleResetScheme = () => {
        localStorage.removeItem("savedScheme");
        localStorage.removeItem("schemeDetails");
        alert("Scheme reset.")
        window.location.reload(true);
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
     * retrieve and apply the saved scheme
     */
    applySavedScheme = () => {
        if (localStorage.getItem("savedScheme") && localStorage.getItem("schemeDetails")) {
            this.scheme = JSON.parse(localStorage.getItem("savedScheme"));
            this.applyScheme();
        }
    }

    /**
     * save the current color scheme details
     */
    saveSchemeDetails = () => {
        const schemeDetails = {
            rootColor: this.rootColor,
            rootColorName: this.rootColorName,
            colorMode: this.colorMode
        };
        
        localStorage.setItem("schemeDetails", JSON.stringify(schemeDetails));
    }

    /**
     * retrieve and apply the saved scheme details
     */
    applySavedSchemeDetails = () => {
        if (localStorage.getItem("savedScheme") && localStorage.getItem("schemeDetails")) {
            const schemeDetails = JSON.parse(localStorage.getItem("schemeDetails"));
            this.rootColor = schemeDetails.rootColor;
            this.rootColorName = schemeDetails.rootColorName;
            this.colorMode = schemeDetails.colorMode;
            this.renderSchemeDetails();
        }
    }

    /**
     * generates the UI and binds the click handlers for THEMEMAKER
     */
    generateUi = () => {
        const uiSchema = [
            {
                type: "button",
                properties: {
                    id: "generateSchemeButton",
                    innerText: "generate scheme",
                    style: {
                        position: "fixed",
                        padding: 0,
                        margin: 0,
                        fontSize: "10px",
                        border: "none",
                        outline: "none",
                        top: "0px",
                        right: "0px",
                        backgroundColor: "#FFFFFF",
                        color: "#000000",
                        zIndex: "999999999"
                    },
                    onclick: this.handleGenerateScheme
                }
            },
            {
                type: "button",
                properties: {
                    id: "saveSchemeButton",
                    innerText: "save scheme",
                    style: {
                        display: `${this.scheme ? "block" : "none"}`,
                        position: "fixed",
                        padding: 0,
                        margin: 0,
                        fontSize: "10px",
                        border: "none",
                        outline: "none",
                        top: "20px",
                        right: "0px",
                        backgroundColor: "#FFFFFF",
                        color: "#000000",
                        zIndex: "999999999"
                    },
                    onclick: this.handleSaveScheme
                }
            },
            {
                type: "button",
                properties: {
                    id: "resetSchemeButton",
                    innerText: "reset scheme",
                    style: {
                        display: `${this.scheme ? "block" : "none"}`,
                        position: "fixed",
                        padding: 0,
                        margin: 0,
                        fontSize: "10px",
                        border: "none",
                        outline: "none",
                        top: "40px",
                        right: "0px",
                        backgroundColor: "#FFFFFF",
                        color: "#000000",
                        zIndex: "999999999"
                    },
                    onclick: this.handleResetScheme
                }
            },
            {
                type: "button",
                properties: {
                    id: "showDetailsButton",
                    innerText: "show details",
                    style: {
                        display: `${this.scheme ? "block" : "none"}`,
                        position: "fixed",
                        padding: 0,
                        margin: 0,
                        fontSize: "10px",
                        border: "none",
                        outline: "none",
                        top: "60px",
                        right: "0px",
                        backgroundColor: "#FFFFFF",
                        color: "#000000",
                        zIndex: "999999999"
                    },
                    onclick: this.handleShowDetails
                }
            },
            {
                type: "button",
                properties: {
                    id: "hideDetailsButton",
                    innerText: "hide details",
                    style: {
                        display: `${this.scheme ? "block" : "none"}`,
                        position: "fixed",
                        padding: 0,
                        margin: 0,
                        fontSize: "10px",
                        border: "none",
                        outline: "none",
                        top: "80px",
                        right: "0px",
                        backgroundColor: "#FFFFFF",
                        color: "#000000",
                        zIndex: "999999999"
                    },
                    onclick: this.handleHideDetails
                }
            },
            {
                type: "div",
                properties: {
                    id: "schemeDetailsPanel",
                    style: {
                        position: "fixed",
                        fontSize: "10px",
                        bottom: "0px",
                        right: "0px",
                        padding: "5px",
                        border: "1px solid black",
                        zIndex: "999999999",
                        display: "none"
                    }
                }
            }
        ]
        
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
        if (this.scheme) {
            document.querySelector("#saveSchemeButton").style.display = "block";
            document.querySelector("#resetSchemeButton").style.display = "block";

            document.querySelector("#showDetailsButton").style.display = this.showDetails ? "none" : "block";
            document.querySelector("#hideDetailsButton").style.display = this.showDetails ? "block" : "none";
            this.renderSchemeDetails();
        }
    }

    /**
     * initialize THEMEMAKER
     */
    initialize = () => {
        this.generateUi();
        this.applySavedScheme();
        this.applySavedSchemeDetails();
    }
}

let themeMaker;

window.onload = () => {
    const modes = [
        "monochrome", "monochrome-dark", "monochrome-light", 
        "complement", "analogic-complement", 
        "triad", 
        "quad"
    ];

    const htmlElements = { 
        darkContainer: ["body", "main", "div"],
        mediumContainer: ["pre", "code"],
        lightContainer: ["button", "td", "th", 'input[type="submit"]'],
        clearContainer: ["header", "footer", "article", "section", "aside", "nav", "tbody", "ul", "li"],
        darkText: ["h4", "h5", "h6", "li"],
        mediumText: ["h3", "h2", "a", "ul"],
        lightText: ["h1", "p", "span"]
    };

    themeMaker = new Thememaker(modes, htmlElements);

    themeMaker.initialize();
}
