/**********this stuff is just making the placeholder UI buttons************/

const docBody = document.querySelector("body");

const generateButton = document.createElement("button");
generateButton.innerText = "generate scheme"
generateButton.style.position = "fixed";
generateButton.style.top = "0px";
generateButton.style.right = "0px";
generateButton.style.zIndex = "99999999";
generateButton.onclick = fetchData;
docBody.appendChild(generateButton);

const saveButton = document.createElement("button");
saveButton.innerText = "save scheme"
saveButton.style.position = "fixed";
saveButton.style.top = "20px";
saveButton.style.right = "0px";
saveButton.style.zIndex = "99999999";
saveButton.onclick = saveScheme;
docBody.appendChild(saveButton);

// const resetButton = document.createElement("button");
// resetButton.innerText = "reset scheme"
// resetButton.style.position = "fixed";
// resetButton.style.top = "40px";
// resetButton.style.right = "0px";
// resetButton.style.zIndex = "99999999";
// docBody.appendChild(resetButton);

/**********the stuff above is just making the placeholder UI buttons************/


//function to generate random number
function randomNum(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

//function to generate the color scheme object
function generateScheme(colorArr) {
    console.log('generating scheme')
    //empty object to hold color scheme -> {'body': 'color1', 'p': 'color2', etc.}
    const colorScheme = {};
    //if first color (root color) is black, just make everything else white
    if (colorArr[0] === "#000000" ) {
        for (let i = 1; i < htmlElements.length; i++) {
            colorArr[i] = "#FFFFFF";
        }
    }
    for (let j = 0; j < htmlElements.length; j++) {
        colorScheme[htmlElements[j]] = colorArr[j];
    }
    
    return colorScheme;
}

//function to apply the color scheme
function applyScheme(schemeObj) {
    console.log('applying scheme')
    for (const [key, value] of Object.entries(schemeObj)) {
        if (key === 'body') {
            console.log('here')
            const selector = document.querySelector(key)
            selector.style.backgroundColor = value;
            selector.style.color = schemeObj["p"];
        }
        else if (key ==='button' || key === 'div' || key === 'ul') {
            const selectorAll = document.querySelectorAll(key);
            selectorAll.forEach(selected=>{
                selected.style.backgroundColor = schemeObj["body"];
                selected.style.color = schemeObj["p"];
            }) 
        }
        else {
            const selectorAll = document.querySelectorAll(key);
            selectorAll.forEach(selected=>{
                selected.style.color = value;
            }) 
        }
        
    }
}

//global const array of common html elements
const htmlElements = ['body', 'ul', 'div', 'hr', 'span', 'button', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p'];
//global const array of different modes for fetch request
const modes = ['monochrome', 'monochrome-dark', 'monochrome-light', 'analogic', 'complement', 'analogic-complement', 'triad', 'quad'];
let colorSchemeGlobal = {};

//function to fetch new color data
function fetchData() {
    //empty array to hold generate colors
    const generatedColors = [];
    //generate a random mode to put into fetch request
    const randomMode = modes[randomNum(0, modes.length-1)];
    //generate a random color to put into fetch request
    const randomColor = Math.floor(Math.random()*16777215).toString(16);
    console.log('fetching', randomMode, randomColor)
    fetch(`//www.thecolorapi.com/scheme?hex=${randomColor}&mode=${randomMode}&format=json&count=14`)
    .then(data=>data.json())
    .then(data=>{
        console.log(data)
        const colorArray = data["colors"];
        colorArray.forEach(colorObj=>{
            generatedColors.push(colorObj["hex"]["value"]);
        })
        const colorScheme = generateScheme(generatedColors);
        console.log(colorScheme);
        applyScheme(colorScheme);
        colorSchemeGlobal = colorScheme;
    })
}

//function to save scheme in local storage
function saveScheme() {
    console.log(colorSchemeGlobal);
    localStorage.setItem("saved scheme", JSON.stringify(colorSchemeGlobal));
    alert('Success, color scheme saved.');
}

//window on load function to apply the saved scheme in local storage
window.onload = function() {
    if (localStorage.getItem("saved scheme")) {
        console.log('saved scheme detected, applying the saved scheme.')
        this.applyScheme(JSON.parse(localStorage.getItem("saved scheme")));
    }
}


