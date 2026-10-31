// Le calcul du ciel tourne hors du fil principal : l'écran s'affiche avant les éphémérides.
import { computeSky } from "./sky-model";

self.onmessage = (e: MessageEvent<number>) => {
  self.postMessage(computeSky(new Date(e.data)));
};
