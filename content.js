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
     * @param {String} colorApiUrl 
     * @returns an array of hexadecimal color strings from the given color api url
     */
    fetchColors = async (colorApiUrl) => {
        const generatedColors = [];
        console.info("fetching:", this.rootColor, this.colorMode);

        // colorSchemeLink = `<p>Root Color: <a href="//www.thecolorapi.com/scheme?hex=${randomColor}&mode=${randomMode}&format=html&count=${htmlElements.length}" target="_blank">${randomColor}</a></p>`
        const resp = await fetch(colorApiUrl);
        const data = await resp.json();

        if (!data.colors) { 
            throw new Error("Error, invalid color data");
        };

        if (data.colors.length < this.htmlElements.length) {
            return await this.fetchColors();
        }

        data?.colors.forEach(colorObj=>{
            generatedColors.push(colorObj?.hex?.value);
        })

        this.rootColorName = data?.seed?.name?.value;

        return generatedColors;
    }

    /**
     * 
     * @param {[]} colorArr 
     * @returns an object describing a color scheme of html element: color key/value pairs
     * -> {"body": "color1", "p": "color2", etc.}
     */
    generateScheme = (colorArr) => {
        const colorScheme = {};
        for (let i = 0; i < this.htmlElements.length; i++) {
            if (colorArr[0] === "#000000") {
                if (
                    this.htmlElements[i] === "h1" ||
                    this.htmlElements[i] === "h2" ||
                    this.htmlElements[i] === "h3" ||
                    this.htmlElements[i] === "h4" ||
                    this.htmlElements[i] === "h5" ||
                    this.htmlElements[i] === "h6" ||
                    this.htmlElements[i] === "span" ||
                    this.htmlElements[i] === "a" ||
                    this.htmlElements[i] === "p"
                ) {
                    colorScheme[this.htmlElements[i]] = "#FFFFFF";
                } else {
                    colorScheme[this.htmlElements[i]] = colorArr[i];
                }
            } else {
                colorScheme[this.htmlElements[i]] = colorArr[i];
            }
        }

        return colorScheme;
    }

    /**
     * 
     * applies the color scheme
     */
    applyScheme = () => {
        for (const [key, value] of Object.entries(this.scheme)) {
            if (key === "body") {
                const selectedNode = document.querySelector(key)
                selectedNode.style.backgroundColor = value;
                selectedNode.style.color = this.scheme["p"];
            }
            // treat certain elements like the body
            else if (
                key ==="button" || 
                key === "code" ||
                key === "div" || 
                key === "ul" || 
                key === "li" || 
                key === "td" || 
                key === "th"
            ) {
                const selectedNodes = document.querySelectorAll(key);
                selectedNodes.forEach((node) => {
                    node.style.backgroundColor = value;
                    node.style.color = this.scheme["p"];
                });
            }
            else {
                const selectedNodes = document.querySelectorAll(key);
                selectedNodes.forEach((node) => {
                    node.style.color = value;
                });
            }
        }

        this.updateUi();
    }

    /**
     * applies the color scheme details to the details panel
     */
    renderSchemeDetails = () => {
        // add color scheme details to UI panel
        const colorApiUrl = this.generateColorApiUrl("html");

        let colorSchemeInfo = `<p><a href=${colorApiUrl}">${this.rootColorName} (${this.colorMode})</a></p>`
    
        for (let [key, value] of Object.entries(this.scheme)) {
            // TODO: color the value
            let newP = `<p style="color: ${value}">${key}: ${value}</p>`;
            colorSchemeInfo += newP;
        }
    
        const schemeDetailsPanel = document.querySelector("#schemeDetailsPanel")
    
        schemeDetailsPanel.innerHTML = colorSchemeInfo;
        schemeDetailsPanel.style.backgroundColor = this.scheme.body === "#000000" ? "#808080" : "#FFFFFF";
    }

    /**
     * 
     * @param {string} format 
     * @returns a string representing a valid color api url
     */
    generateColorApiUrl = (format) => {
        return `//www.thecolorapi.com/scheme?hex=${this.rootColor}&mode=${this.colorMode}&format=${format}&count=${this.htmlElements.length}`
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
        console.log(colorApiUrl);

        // fetch data
        const fetchedColors = await this.fetchColors(colorApiUrl);
        console.log(fetchedColors)

        // generate the scheme
        this.scheme = this.generateScheme(fetchedColors);
        console.log(this.scheme)

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
    }

    /**
     * click handler to hide the details panel
     */
    handleHideDetails = () => {
        const schemeDetails = document.querySelector("#schemeDetailsPanel")
        schemeDetails.style.display = "none";
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
            document.querySelector("#showDetailsButton").style.display = "block";
            document.querySelector("#hideDetailsButton").style.display = "block";
            this.renderSchemeDetails();
        }
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

    const htmlElements = [
        "body", 
        "button",
        "td", "th", 
        "div", 
        "hr", 
        "h1", "h2", "h3", "h4", "h5", "h6",
        "span", "a", "p"
    ];

    themeMaker = new Thememaker(modes, htmlElements);

    themeMaker.generateUi();
    themeMaker.applySavedScheme();
    themeMaker.applySavedSchemeDetails();
}

// TODO make this work with reactive content
// document.addEventListener("click", () => {
//     themeMaker.generateUi();
//     themeMaker.applyScheme();
//     themeMaker.renderSchemeDetails();
// })
