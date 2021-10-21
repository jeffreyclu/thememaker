export const modes = [
    "monochrome", "monochrome-dark", "monochrome-light", 
    "complement", "analogic-complement", 
    "triad", 
    "quad"
];

export const htmlElements = { 
    darkContainer: ["body", "main", "div"],
    mediumContainer: ["pre", "code"],
    lightContainer: ["button", "td", "th"],
    clearContainer: ["header", "footer", "article", "section", "aside", "nav", "tbody", "ul", "li"],
    darkText: ["h4", "h5", "h6", "li"],
    mediumText: ["h3", "h2", "a", "ul"],
    lightText: ["h1", "p", "span"]
};

export const generateUiSchema = (
    generateSchemeCb,
    saveSchemeCb,
    resetSchemeCb,
    showDetailsCb,
    hideDetailsCb,
    showHistoryCb,
    hideHistoryCb
) => {
    return [
        {
            type: "button",
            properties: {
                id: "generateSchemeButton",
                innerText: "generate scheme",
                style: {
                    display: "block",
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
                onclick: generateSchemeCb
            }
        },
        {
            type: "button",
            properties: {
                id: "saveSchemeButton",
                innerText: "save scheme",
                style: {
                    display: "none",
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
                onclick: saveSchemeCb
            }
        },
        {
            type: "button",
            properties: {
                id: "resetSchemeButton",
                innerText: "reset scheme",
                style: {
                    display: "none",
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
                onclick: resetSchemeCb
            }
        },
        {
            type: "button",
            properties: {
                id: "showDetailsButton",
                innerText: "show details",
                style: {
                    display: "none",
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
                onclick: showDetailsCb
            }
        },
        {
            type: "button",
            properties: {
                id: "hideDetailsButton",
                innerText: "hide details",
                style: {
                    display: "none",
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
                onclick: hideDetailsCb
            }
        },
        {
            type: "button",
            properties: {
                id: "showHistoryButton",
                innerText: "show history",
                style: {
                    display: "none",
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
                onclick: showHistoryCb
            }
        },
        {
            type: "button",
            properties: {
                id: "hideHistoryButton",
                innerText: "hide history",
                style: {
                    display: "none",
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
                onclick: hideHistoryCb
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
        },
        {
            type: "div",
            properties: {
                id: "schemeHistoryPanel",
                style: {
                    position: "fixed",
                    fontSize: "10px",
                    bottom: "0px",
                    left: "0px",
                    padding: "5px",
                    border: "1px solid black",
                    zIndex: "999999999",
                    display: "none"
                }
            }
        }
    ]
}
