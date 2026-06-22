// Onboarding.jsx — tutoriel 3 étapes au premier lancement.
// Pose le contrat de confiance : réversibilité, honnêteté, simplicité.
import React, { useState } from "react";
import { IconShield, IconCheck, IconBolt } from "./Icons.jsx";

const STEPS = [
  {
    ic: IconShield,
    title: "Conçu pour la confiance",
    body: "Avant chaque modification, PulseBoost crée un point de restauration Windows et journalise la valeur d'origine. Tout est réversible en 1 clic — toujours.",
  },
  {
    ic: IconCheck,
    title: "Honnête, pas marketing",
    body: "On ne promet jamais « +200 FPS garantis ». On mesure le réel, on t'explique les limites matérielles, et on te dit quand un upgrade vaut mieux qu'un réglage.",
  },
  {
    ic: IconBolt,
    title: "Optimise en 1 clic",
    body: "Un seul bouton applique les réglages gaming sûrs et réversibles. Le reste (réseau, mémoire, profils par jeu) reste là quand tu veux aller plus loin.",
  },
];

export default function Onboarding({ onDone }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const Ic = step.ic;
  const last = i === STEPS.length - 1;
  return (
    <div className="modal-overlay onb-overlay">
      <div className="modal-box onb" key={i}>
        <div className="onb-ico"><Ic width={30} height={30} /></div>
        <h2>{step.title}</h2>
        <p className="muted onb-body">{step.body}</p>
        <div className="onb-dots">
          {STEPS.map((_, k) => <span key={k} className={k === i ? "on" : ""} />)}
        </div>
        <div className="row-between onb-actions">
          <button className="btn ghost" onClick={onDone}>Passer</button>
          <button className="btn primary" onClick={() => (last ? onDone() : setI(i + 1))}>
            {last ? "Commencer" : "Suivant"}
          </button>
        </div>
      </div>
    </div>
  );
}
