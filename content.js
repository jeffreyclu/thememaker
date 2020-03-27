const colorsArr = [];
//array of predefined colors = ['red', 'blue', etc]

fetch("http://thecolorapi.com/scheme?hex=0047AB&format=json&count=3")
    .then(data=>data.json())
    .then(data=>{
        data["colors"].forEach(colorObj=>{
            colorsArr.push(colorObj["hex"]["value"]);
        })
        console.log(colorsArr);
    })

//[array of colors, randomized]
//[array of html elements]

// { 
//     "<p>": "randomcolor 1",
//     "h1": "randomcolor 2"
// }

// use a function here:
// document.querySelectorAll(each html element) set the element.style.color = each random color