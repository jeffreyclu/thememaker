import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import Thememaker from "../src/thememaker";
import { modes, htmlElements } from "../src/config";
import { mockScheme, mockColorArr } from "./helper";
import { JSDOM } from "jsdom"
import _ from "lodash";

const dom = new JSDOM()
global.document = dom.window.document
global.window = dom.window
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
    json: () => Promise.resolve({"mode":"analogic-complement","count":"7","colors":[{"hex":{"value":"#6F928B","clean":"6F928B"},"rgb":{"fraction":{"r":0.43529411764705883,"g":0.5725490196078431,"b":0.5450980392156862},"r":111,"g":146,"b":139,"value":"rgb(111, 146, 139)"},"hsl":{"fraction":{"h":0.4666666666666667,"s":0.13833992094861655,"l":0.503921568627451},"h":168,"s":14,"l":50,"value":"hsl(168, 14%, 50%)"},"hsv":{"fraction":{"h":0.4666666666666667,"s":0.2397260273972602,"v":0.5725490196078431},"value":"hsv(168, 24%, 57%)","h":168,"s":24,"v":57},"name":{"value":"Juniper","closest_named_hex":"#6D9292","exact_match_name":false,"distance":219},"cmyk":{"fraction":{"c":0.2397260273972602,"m":0,"y":0.04794520547945208,"k":0.4274509803921569},"value":"cmyk(24, 0, 5, 43)","c":24,"m":0,"y":5,"k":43},"XYZ":{"fraction":{"X":0.4826490196078431,"Y":0.5413866666666667,"Z":0.5947647058823529},"value":"XYZ(48, 54, 59)","X":48,"Y":54,"Z":59},"image":{"bare":"http://www.thecolorapi.com/id?format=svg&named=false&hex=6F928B","named":"http://www.thecolorapi.com/id?format=svg&hex=6F928B"},"contrast":{"value":"#000000"},"_links":{"self":{"href":"/id?hex=6F928B"}},"_embedded":{}},{"hex":{"value":"#759E96","clean":"759E96"},"rgb":{"fraction":{"r":0.4588235294117647,"g":0.6196078431372549,"b":0.5882352941176471},"r":117,"g":158,"b":150,"value":"rgb(117, 158, 150)"},"hsl":{"fraction":{"h":0.467479674796748,"s":0.174468085106383,"l":0.5392156862745098},"h":168,"s":17,"l":54,"value":"hsl(168, 17%, 54%)"},"hsv":{"fraction":{"h":0.467479674796748,"s":0.259493670886076,"v":0.6196078431372549},"value":"hsv(168, 26%, 62%)","h":168,"s":26,"v":62},"name":{"value":"Sea Nymph","closest_named_hex":"#78A39C","exact_match_name":false,"distance":136},"cmyk":{"fraction":{"c":0.2594936708860761,"m":0,"y":0.05063291139240506,"k":0.3803921568627451},"value":"cmyk(26, 0, 5, 38)","c":26,"m":0,"y":5,"k":38},"XYZ":{"fraction":{"X":0.5169670588235294,"Y":0.58316,"Z":0.6418301960784314},"value":"XYZ(52, 58, 64)","X":52,"Y":58,"Z":64},"image":{"bare":"http://www.thecolorapi.com/id?format=svg&named=false&hex=759E96","named":"http://www.thecolorapi.com/id?format=svg&hex=759E96"},"contrast":{"value":"#000000"},"_links":{"self":{"href":"/id?hex=759E96"}},"_embedded":{}},{"hex":{"value":"#7CA9A1","clean":"7CA9A1"},"rgb":{"fraction":{"r":0.48627450980392156,"g":0.6627450980392157,"b":0.6313725490196078},"r":124,"g":169,"b":161,"value":"rgb(124, 169, 161)"},"hsl":{"fraction":{"h":0.47037037037037044,"s":0.20737327188940088,"l":0.5745098039215686},"h":169,"s":21,"l":57,"value":"hsl(169, 21%, 57%)"},"hsv":{"fraction":{"h":0.47037037037037044,"s":0.2662721893491124,"v":0.6627450980392157},"value":"hsv(169, 27%, 66%)","h":169,"s":27,"v":66},"name":{"value":"Sea Nymph","closest_named_hex":"#78A39C","exact_match_name":false,"distance":161},"cmyk":{"fraction":{"c":0.26627218934911234,"m":0,"y":0.047337278106508875,"k":0.33725490196078434},"value":"cmyk(27, 0, 5, 34)","c":27,"m":0,"y":5,"k":34},"XYZ":{"fraction":{"X":0.5514999999999999,"Y":0.6229623529411765,"Z":0.6885039215686274},"value":"XYZ(55, 62, 69)","X":55,"Y":62,"Z":69},"image":{"bare":"http://www.thecolorapi.com/id?format=svg&named=false&hex=7CA9A1","named":"http://www.thecolorapi.com/id?format=svg&hex=7CA9A1"},"contrast":{"value":"#000000"},"_links":{"self":{"href":"/id?hex=7CA9A1"}},"_embedded":{}},{"hex":{"value":"#B8AD86","clean":"B8AD86"},"rgb":{"fraction":{"r":0.7215686274509804,"g":0.6784313725490196,"b":0.5254901960784314},"r":184,"g":173,"b":134,"value":"rgb(184, 173, 134)"},"hsl":{"fraction":{"h":0.13,"s":0.2604166666666667,"l":0.6235294117647059},"h":47,"s":26,"l":62,"value":"hsl(47, 26%, 62%)"},"hsv":{"fraction":{"h":0.13,"s":0.2717391304347826,"v":0.7215686274509804},"value":"hsv(47, 27%, 72%)","h":47,"s":27,"v":72},"name":{"value":"Mongoose","closest_named_hex":"#B5A27F","exact_match_name":false,"distance":309},"cmyk":{"fraction":{"c":0,"m":0.05978260869565211,"y":0.2717391304347826,"k":0.2784313725490196},"value":"cmyk(0, 6, 27, 28)","c":0,"m":6,"y":27,"k":28},"XYZ":{"fraction":{"X":0.6350329411764706,"Y":0.6765599999999999,"Z":0.5942737254901961},"value":"XYZ(64, 68, 59)","X":64,"Y":68,"Z":59},"image":{"bare":"http://www.thecolorapi.com/id?format=svg&named=false&hex=B8AD86","named":"http://www.thecolorapi.com/id?format=svg&hex=B8AD86"},"contrast":{"value":"#000000"},"_links":{"self":{"href":"/id?hex=B8AD86"}},"_embedded":{}},{"hex":{"value":"#B5BA88","clean":"B5BA88"},"rgb":{"fraction":{"r":0.7098039215686275,"g":0.7294117647058823,"b":0.5333333333333333},"r":181,"g":186,"b":136,"value":"rgb(181, 186, 136)"},"hsl":{"fraction":{"h":0.18333333333333324,"s":0.26595744680851063,"l":0.6313725490196078},"h":66,"s":27,"l":63,"value":"hsl(66, 27%, 63%)"},"hsv":{"fraction":{"h":0.18333333333333324,"s":0.26881720430107525,"v":0.7294117647058823},"value":"hsv(66, 27%, 73%)","h":66,"s":27,"v":73},"name":{"value":"Swamp Green","closest_named_hex":"#ACB78E","exact_match_name":false,"distance":468},"cmyk":{"fraction":{"c":0.026881720430107434,"m":0,"y":0.26881720430107525,"k":0.2705882352941177},"value":"cmyk(3, 0, 27, 27)","c":3,"m":0,"y":27,"k":27},"XYZ":{"fraction":{"X":0.6498274509803921,"Y":0.7110862745098039,"Z":0.6075784313725491},"value":"XYZ(65, 71, 61)","X":65,"Y":71,"Z":61},"image":{"bare":"http://www.thecolorapi.com/id?format=svg&named=false&hex=B5BA88","named":"http://www.thecolorapi.com/id?format=svg&hex=B5BA88"},"contrast":{"value":"#000000"},"_links":{"self":{"href":"/id?hex=B5BA88"}},"_embedded":{}},{"hex":{"value":"#A6BC89","clean":"A6BC89"},"rgb":{"fraction":{"r":0.6509803921568628,"g":0.7372549019607844,"b":0.5372549019607843},"r":166,"g":188,"b":137,"value":"rgb(166, 188, 137)"},"hsl":{"fraction":{"h":0.2385620915032678,"s":0.2756756756756758,"l":0.6372549019607843},"h":86,"s":28,"l":64,"value":"hsl(86, 28%, 64%)"},"hsv":{"fraction":{"h":0.2385620915032678,"s":0.27127659574468094,"v":0.7372549019607844},"value":"hsv(86, 27%, 74%)","h":86,"s":27,"v":74},"name":{"value":"Swamp Green","closest_named_hex":"#ACB78E","exact_match_name":false,"distance":576},"cmyk":{"fraction":{"c":0.11702127659574471,"m":0,"y":0.27127659574468094,"k":0.26274509803921564},"value":"cmyk(12, 0, 27, 26)","c":12,"m":0,"y":27,"k":26},"XYZ":{"fraction":{"X":0.6290811764705883,"Y":0.7044729411764706,"Z":0.6111054901960785},"value":"XYZ(63, 70, 61)","X":63,"Y":70,"Z":61},"image":{"bare":"http://www.thecolorapi.com/id?format=svg&named=false&hex=A6BC89","named":"http://www.thecolorapi.com/id?format=svg&hex=A6BC89"},"contrast":{"value":"#000000"},"_links":{"self":{"href":"/id?hex=A6BC89"}},"_embedded":{}},{"hex":{"value":"#98BE8B","clean":"98BE8B"},"rgb":{"fraction":{"r":0.596078431372549,"g":0.7450980392156863,"b":0.5450980392156862},"r":152,"g":190,"b":139,"value":"rgb(152, 190, 139)"},"hsl":{"fraction":{"h":0.29084967320261423,"s":0.28176795580110503,"l":0.6450980392156862},"h":105,"s":28,"l":65,"value":"hsl(105, 28%, 65%)"},"hsv":{"fraction":{"h":0.29084967320261423,"s":0.268421052631579,"v":0.7450980392156863},"value":"hsv(105, 27%, 75%)","h":105,"s":27,"v":75},"name":{"value":"Olivine","closest_named_hex":"#9AB973","exact_match_name":false,"distance":1727},"cmyk":{"fraction":{"c":0.20000000000000004,"m":0,"y":0.268421052631579,"k":0.2549019607843137},"value":"cmyk(20, 0, 27, 25)","c":20,"m":0,"y":27,"k":25},"XYZ":{"fraction":{"X":0.61066,"Y":0.6989764705882353,"Z":0.6184356862745097},"value":"XYZ(61, 70, 62)","X":61,"Y":70,"Z":62},"image":{"bare":"http://www.thecolorapi.com/id?format=svg&named=false&hex=98BE8B","named":"http://www.thecolorapi.com/id?format=svg&hex=98BE8B"},"contrast":{"value":"#000000"},"_links":{"self":{"href":"/id?hex=98BE8B"}},"_embedded":{}}],"seed":{"hex":{"value":"#B98790","clean":"B98790"},"rgb":{"fraction":{"r":0.7254901960784313,"g":0.5294117647058824,"b":0.5647058823529412},"r":185,"g":135,"b":144,"value":"rgb(185, 135, 144)"},"hsl":{"fraction":{"h":0.9700000000000001,"s":0.2631578947368421,"l":0.6274509803921569},"h":349,"s":26,"l":63,"value":"hsl(349, 26%, 63%)"},"hsv":{"fraction":{"h":0.9700000000000001,"s":0.27027027027027023,"v":0.7254901960784313},"value":"hsv(349, 27%, 73%)","h":349,"s":27,"v":73},"name":{"value":"Brandy Rose","closest_named_hex":"#BB8983","exact_match_name":false,"distance":519},"cmyk":{"fraction":{"c":0,"m":0.27027027027027023,"y":0.2216216216216216,"k":0.27450980392156865},"value":"cmyk(0, 27, 22, 27)","c":0,"m":27,"y":22,"k":27},"XYZ":{"fraction":{"X":0.5904392156862746,"Y":0.573646274509804,"Z":0.6138607843137255},"value":"XYZ(59, 57, 61)","X":59,"Y":57,"Z":61},"image":{"bare":"http://www.thecolorapi.com/id?format=svg&named=false&hex=B98790","named":"http://www.thecolorapi.com/id?format=svg&hex=B98790"},"contrast":{"value":"#000000"},"_links":{"self":{"href":"/id?hex=B98790"}},"_embedded":{}},"image":{"bare":"http://www.thecolorapi.com/scheme?format=svg&named=false&hex=B98790&mode=analogic-complement&count=7","named":"http://www.thecolorapi.com/scheme?format=svg&hex=B98790&mode=analogic-complement&count=7"},"_links":{"self":"/scheme?hex=B98790&mode=analogic-complement&count=7","schemes":{"monochrome":"/scheme?hex=B98790&mode=monochrome&count=7","monochrome-dark":"/scheme?hex=B98790&mode=monochrome-dark&count=7","monochrome-light":"/scheme?hex=B98790&mode=monochrome-light&count=7","analogic":"/scheme?hex=B98790&mode=analogic&count=7","complement":"/scheme?hex=B98790&mode=complement&count=7","analogic-complement":"/scheme?hex=B98790&mode=analogic-complement&count=7","triad":"/scheme?hex=B98790&mode=triad&count=7","quad":"/scheme?hex=B98790&mode=quad&count=7"}},"_embedded":{}}),
});

describe("Thememaker", () => {
    let themeMaker;
    beforeEach(() => {
        themeMaker = new Thememaker(modes, htmlElements);
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

    it("calling fetchColors should return an array of hex strings", () => {
        return themeMaker.fetchColors("https://www.thecolorapi.com/scheme?hex=b98790&mode=analogic-complement&format=json&count=7")
            .then(data => {
                console.log(data)
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

    it("calling enqueueScheme should add a scheme to scheme history", () => {
        themeMaker.enqueueScheme({ body: "#000000" });
        expect(themeMaker.schemeHistory).toHaveLength(1);
    })

    it("calling dequeueScheme should return the scheme at the passed index", () => {
        expect(themeMaker.dequeueScheme(0)).toStrictEqual({});
        expect(themeMaker.schemeHistory).toHaveLength(0);
        themeMaker.enqueueScheme({ body: "#000000" });
        expect(themeMaker.schemeHistory).toHaveLength(1);
        expect(themeMaker.dequeueScheme(0)).toStrictEqual({ body: "#000000" });
        expect(themeMaker.schemeHistory).toHaveLength(1);
    })

    it("calling generate scheme should generate a scheme", () => {
        expect(themeMaker.generateScheme(mockColorArr)).toStrictEqual(mockScheme);
    });

    // it("calling apply scheme applies the scheme", () => {
    //     themeMaker.scheme = mockScheme;
    //     themeMaker.applyScheme();
    // })

})