//function to generate random number
function randomNum(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

//function to generate the color scheme object
function generateScheme() {
    //empty object to hold color scheme -> {'body': 'color1', 'p': 'color2', etc.}
    const colorScheme = {};
    for (let i = 0; i < htmlElements.length; i++) {
        colorScheme[htmlElements[i]] = generatedColors[i];
    }
    return colorScheme;
}

//function to apply the color scheme
function applyScheme(schemeObj) {
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

//empty array to hold generate colors
const generatedColors = [];
//array of all basic html elements
const htmlElements = ['body', 'ul', 'div', 'hr', 'span', 'button', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p'];
//array of different modes
const modes = ['monochrome', 'monochrome-dark', 'monochrome-light', 'analogic', 'complement', 'analogic-complement', 'triad', 'quad'];
//generate a random mode to put into fetch request
const randomMode = modes[randomNum(0, modes.length-1)];
//generate a random color to put into fetch request
const randomColor = Math.floor(Math.random()*16777215).toString(16);

fetch(`http://thecolorapi.com/scheme?hex=${randomColor}&mode=${randomMode}&format=json&count=14`)
    .then(data=>data.json())
    .then(data=>{
        console.log(data)
        const colorArray = data["colors"];
        colorArray.forEach(colorObj=>{
            generatedColors.push(colorObj["hex"]["value"]);
        })
        const colorScheme = generateScheme();
        console.log(colorScheme);
        applyScheme(colorScheme);
})



