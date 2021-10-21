import Thememaker from "./thememaker.js";
import { modes, htmlElements } from "./config.js";

const themeMaker = new Thememaker(modes, htmlElements);

themeMaker.initialize();
