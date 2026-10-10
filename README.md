# openOMSI pour Stream Deck

Contrôle ton bus dans [openOMSI](https://github.com/openOMSI-org/openOMSI) depuis un Stream
Deck. Les touches affichent aussi l'état du bus en direct : porte ouverte, clignotant qui
clignote, frein serré, vitesse, retard, prochain arrêt…

Il y a deux morceaux :

| | Rôle |
| --- | --- |
| `game/streamdeck.lua` | plugin Lua pour openOMSI : envoie l'état du bus et exécute les commandes |
| `streamdeck/` | plugin Stream Deck (SDK v3, TypeScript) |

## Installation

Télécharge les deux fichiers de la [dernière version](https://github.com/yazouv/openomsi-streamdeck/releases/latest) :

1. **Côté jeu** : copie `streamdeck.lua` dans le dossier `plugins` d'openOMSI (à côté
   de `openomsi.exe` ; crée le dossier s'il n'existe pas). openOMSI 0.2.22 ou plus récent.
2. **Côté Stream Deck** : double-clique sur `fr.yazouv.openomsi.streamDeckPlugin`. La
   catégorie **openOMSI** apparaît dans la liste des actions (Stream Deck 7.1 ou plus
   récent).
3. Lance une partie, monte dans un bus : les touches s'allument.

## Les actions

| Action | Appui | La touche montre |
| --- | --- | --- |
| Porte | ouvre/ferme la porte 1, 2, 3, 4 ou toutes | vert quand elle est ouverte |
| DEV (CG active) | le bouton DEV du bus | ambre quand le DEV est actif |
| Frein d'arrêt | serre / desserre le frein d'arrêt (break valve) | rouge quand il est serré |
| Clignotant | gauche, droite ou warning ; un 2e appui l'éteint | clignote en ambre (warning : rouge) |
| Phares | veilleuses, croisement ou route | allumée quand ce feu l'est |
| Frein de parking | serre / desserre | rouge quand il est serré |
| Moteur | démarre ou coupe le bus (comme Maj+U) | vert moteur tournant |
| Boîte auto (D / N / R) | passe en D, N ou R (une touche par position) | allumée sur la position engagée |
| Klaxon | klaxonne tant que la touche est enfoncée | |
| Éclairage intérieur | allume / éteint | ambre quand allumé |
| Vue | conducteur, passager, extérieur, caméra libre, à pied | allumée sur la vue active |
| Pause | met en pause | |
| Bouton du bus | n'importe quel bouton (trigger) du bus, choisi dans la liste, ou une action de `keyboard.cfg` ; appuyé ou tenu | le libellé choisi ; allumée si une variable choisie n'est pas à 0 |
| Affichage | — | vitesse, limitation, retard, prochain arrêt, heure, ligne, passagers, rapport, carburant ou demande d'arrêt |

Quand le jeu ne répond pas (fermé, pas de plugin Lua), les touches passent en gris. Une
commande que le bus ne connaît pas affiche un ⚠ sur la touche.

## Portes et DEV : quel bouton du bus est utilisé

Les touches appuient sur les boutons du bus comme le clavier d'OMSI, sans passer par la
détection automatique des portes d'openOMSI (qui se trompe sur certains mods) :

| Touche | Trigger du bus |
| --- | --- |
| Porte 1, 2, 3, 4 | `bus_doorfront0`, `bus_doorfront1`, `bus_doorfront2`, `bus_doorfront3` ; s'il manque, un trigger qui finit par `Tuer_<n>` ou `door_<n>` (Citaro C2 : porte 3 = `C2_CP_BT_Tuer_3`) |
| Toutes | la commande « toutes les portes » d'openOMSI |
| DEV | `CG_active` (Heuliez GX127/GX327/GX427, Iveco, MAN Lion's City G…) ; sur le Citaro C2, qui n'en a pas : `bus_dooraft` (sa libération des portes) |
| Frein d'arrêt | `bus_dooraft` (la touche − du pavé numérique) ; pas sur le C2, où cette touche est la libération des portes |

Sur les Heuliez, `CG_active` n'active le DEV que contact mis **et frein d'arrêt serré** :
c'est le script du bus qui veut ça.

openOMSI rend les noms de triggers en minuscules (`cg_active`) : c'est normal, OMSI ne fait
pas la différence.

Le DEV s'allume d'après la variable `DEV`, `CG_active` ou `C2_CP_BT_Tuerfreigabe` (la
première que le bus a). Pour un bus qui fait autrement : action **Bouton du bus**, choisis
le trigger dans la liste (elle montre les boutons du bus que tu conduis) et, si tu veux
qu'elle s'allume, la variable dans « Allumée si ».

## Boîte automatique

Les touches D, N et R appuient sur `automatic_D`, `automatic_N` et `automatic_R`, comme le
clavier d'OMSI. La position engagée est lue dans `C2_Getriebe_Gangvorwahl` (Citaro C2) ou
`antrieb_getr_gangvorwahl` (bus d'OMSI, Heuliez…), sinon d'après le rapport engagé. Sur les
Heuliez, il faut appuyer sur le frein pour passer D ou R : c'est le script du bus qui veut ça.

## Limites connues

- **Pause** : le jeu fige les plugins Lua pendant la pause, donc la touche peut mettre en
  pause mais pas reprendre. Reprends avec la touche P du clavier (ou une action
  « Raccourci » standard du Stream Deck réglée sur P). Pendant la pause, les touches
  passent en gris.
- **Phares** : utilise les actions OMSI d'origine (`kw_standlicht_toggle`,
  `kw_scheinwerfer_toggle`, `kw_fernlicht_toggle`). Certains bus moddés ont leurs propres
  commandes : utilise alors une action personnalisée.
- **Portes une par une** : l'état « ouverte » d'une porte précise vient des variables
  `…Tuer_<n>_V_pos` / `_H_pos` quand le bus en a (C2), sinon des vantaux `door_0`,
  `door_1`… (deux par porte quand il y en a deux fois plus que de portes). Sur un bus
  exotique la touche ne s'allume pas, mais elle marche ; « Toutes » reste juste.

## Comment ça marche

- Jeu → Stream Deck : `streamdeck.lua` envoie l'état en JSON par UDP sur
  `127.0.0.1:47820`, 5 fois par seconde et tout de suite à chaque changement.
- Stream Deck → jeu : un plugin Lua ne peut pas écouter le réseau. Le plugin Stream Deck
  dépose donc chaque commande dans un fichier `plugins/streamdeck.data/inbox/<id>.cmd` (il
  connaît ce dossier grâce aux messages du jeu). Le plugin Lua les lit toutes les 50 ms, les
  exécute, les efface et répond `{ ack, ok }` par UDP.

- `triggers.txt` (écrit par le jeu) : la liste des boutons du bus, pour l'action
  « Bouton du bus » ; `watch.txt` (écrit par le Stream Deck) : les variables à surveiller.

Rien ne sort de l'ordinateur.

## Développement

```bash
cd streamdeck
npm install
npm run build     # images + bin/plugin.js
npm test          # test de bout en bout : streamdeck.lua dans fengari + le vrai lien UDP/fichiers
npm run link      # installe le dossier .sdPlugin en mode dev dans Stream Deck
npm run watch     # recompile et redémarre le plugin à chaque modification
npm run pack      # fabrique dist/fr.yazouv.openomsi.streamDeckPlugin
```

Le plugin Lua se recharge tout seul dans le jeu dès que tu enregistres le fichier.

## Licence

[MIT](LICENSE). `sdpi-components.js` (Corsair Memory Inc., MIT) et les icônes Material
(Google, Apache 2.0) gardent leur licence.
