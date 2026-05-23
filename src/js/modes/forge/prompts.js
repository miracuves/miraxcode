/** Forge prompt classification (Wave 17). */

export function createForgePromptsApi() {

  function isSkeletonOnlyPrompt(prompt) {
    const q = String(prompt || "").toLowerCase();
    return /skeleton|bones|anatomy/.test(q) && !/person with|character with|with (skin|body|outer|muscle)/.test(q);
  }

  function needsTemplateAuthority(prompt) {
    return isKnifeLikePrompt(prompt) || isSwordLikePrompt(prompt) || isDroneLikePrompt(prompt) || isSpoonLikePrompt(prompt) || isPhonePrompt(prompt) || isLaptopPrompt(prompt);
  }

  function isKnifeLikePrompt(prompt) {
    return /knife|dagger|scalpel/.test(String(prompt || "").toLowerCase());
  }

  function isSpoonLikePrompt(prompt) {
    return /\b(spoon|teaspoon|tablespoon|soup spoon|dessert spoon|serving spoon|ladle)\b/.test(String(prompt || "").toLowerCase());
  }

  function isSwordLikePrompt(prompt) {
    const q = String(prompt || "").toLowerCase();
    if (/sword|katana|saber|sabre|rapier/.test(q)) return true;
    return /\bblade\b/.test(q) && !/fan|propeller|rotor|turbine|drone|mower/.test(q);
  }

  function isDroneLikePrompt(prompt) {
    return /drone|quad\s?copter|quad\s?rotor|uav/.test(String(prompt || "").toLowerCase());
  }

  function isPhonePrompt(prompt) {
    return /\b(iphone|phone|smartphone|mobile phone|handset)\b/i.test(String(prompt || ""));
  }

  function isLaptopPrompt(prompt) {
    return /\b(laptop|macbook|notebook computer|ultrabook)\b/i.test(String(prompt || ""));
  }

  function classifyForgePrompt(prompt) {
    const q = String(prompt || "").toLowerCase();
    if (/\b(skull|skeleton|anatomy|anatomical|ribcage|rib cage|heart|brain|torso|hand bones?|femur|humerus|tibia|spine|vertebra|pelvis|mandible|cranium|organ|bones?)\b/.test(q)) {
      return {
        route: "anatomical",
        object: prompt,
        brief: "Anatomical structure requiring SDF composition with union, subtraction, smooth blends, and marching surface extraction.",
      };
    }
    if (/\b(tree|oak|cloud|smoke|creature|dragon|monster|abstract sculpture|amorphous|coral|moss|terrain|rock formation)\b/.test(q)) {
      return {
        route: "organic_diffusion",
        object: prompt,
        brief: "Irregular organic form better suited to image-to-3D diffusion.",
      };
    }
    return {
      route: "parametric",
      object: prompt,
      brief: "Manufactured or engineered object suitable for lathe, tube, extrude, box, sphere, and loft primitives.",
    };
  }

  return {
    isSkeletonOnlyPrompt, needsTemplateAuthority, isKnifeLikePrompt, isSpoonLikePrompt,
    isSwordLikePrompt, isDroneLikePrompt, isPhonePrompt, isLaptopPrompt, classifyForgePrompt,
  };
}
