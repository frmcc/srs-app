// simulation.js
// This script simulates the exact logic from api/grade/route.ts

let srsItem = {
  currentLevel: 0,
  quiz1DocId: "quiz1_text",
  quiz2DocId: "quiz2_text",
  quiz3DocId: "quiz3_text",
  quiz4DocId: "quiz4_text",
  quiz5DocId: "quiz5_text",
  quiz6DocId: null,
  quiz7DocId: null
};

function gradeAttempt(isPass) {
  let nextQuizText = "";
  let updatePayload = {};
  
  // Predict next level for Mastery Stage generation
  const nextLevel = isPass ? srsItem.currentLevel + 1 : srsItem.currentLevel;
  
  if (isPass) {
    if (nextLevel >= 5) {
      // Mastery stage dynamic generation
      nextQuizText = `[DYNAMIC_QUIZ_GENERATED_FOR_LEVEL_${nextLevel}]`;
    }
  } else {
    // Remedial stage dynamic generation
    nextQuizText = `[REMEDIAL_QUIZ_GENERATED_FOR_LEVEL_${srsItem.currentLevel}]`;
  }
  
  // Calculate interval
  let intervalDays = 1;
  if (isPass) {
    switch (srsItem.currentLevel) {
      case 0: intervalDays = 3; break;
      case 1: intervalDays = 7; break;
      case 2: intervalDays = 21; break;
      case 3: intervalDays = 60; break;
      case 4: intervalDays = 180; break;
      default: intervalDays = 365; break;
    }
  } else {
    switch (srsItem.currentLevel) {
      case 0: intervalDays = 1; break;
      case 1: intervalDays = 3; break;
      default: intervalDays = 7; break;
    }
  }
  
  if (isPass) {
    updatePayload.currentLevel = nextLevel;
    if (nextQuizText) {
      const nextQuizField = nextLevel === 5 ? "quiz6DocId" : "quiz7DocId";
      updatePayload[nextQuizField] = nextQuizText;
    }
  } else {
    const quizField = srsItem.currentLevel === 0 ? "quiz1DocId" :
                      srsItem.currentLevel === 1 ? "quiz2DocId" :
                      srsItem.currentLevel === 2 ? "quiz3DocId" :
                      srsItem.currentLevel === 3 ? "quiz4DocId" : 
                      srsItem.currentLevel === 4 ? "quiz5DocId" :
                      srsItem.currentLevel === 5 ? "quiz6DocId" : "quiz7DocId";
                      
    if (nextQuizText) {
      updatePayload[quizField] = nextQuizText;
    }
  }
  
  // Apply update to fake DB
  srsItem = { ...srsItem, ...updatePayload };
  
  // Determine what frontend will fetch next time
  const quizFields = [
    srsItem.quiz1DocId,
    srsItem.quiz2DocId,
    srsItem.quiz3DocId,
    srsItem.quiz4DocId,
    srsItem.quiz5DocId,
    srsItem.quiz6DocId,
    srsItem.quiz7DocId
  ];
  const nextQuizToRender = (srsItem.currentLevel >= 6 ? srsItem.quiz7DocId : quizFields[srsItem.currentLevel]) || srsItem.quiz1DocId || "";
  
  return { intervalDays, nextQuizToRender };
}

console.log("=== STARTING SIMULATION ===");
console.log("Initial Level: 0 (Frontend loads quiz1DocId)\n");

const scenarios = [
  { action: "PASS", expectedLevel: 1 },
  { action: "PASS", expectedLevel: 2 },
  { action: "PASS", expectedLevel: 3 },
  { action: "PASS", expectedLevel: 4 },
  { action: "FAIL", expectedLevel: 4 },
  { action: "PASS", expectedLevel: 5 }, // Enters Mastery Stage 1
  { action: "FAIL", expectedLevel: 5 }, 
  { action: "PASS", expectedLevel: 6 }, // Enters Mastery Stage 2
  { action: "PASS", expectedLevel: 7 }, // Infinite Mastery
  { action: "PASS", expectedLevel: 8 }, // Infinite Mastery
  { action: "FAIL", expectedLevel: 8 }, // Infinite Mastery Fail
  { action: "PASS", expectedLevel: 9 }, // Infinite Mastery
];

for (let i = 0; i < scenarios.length; i++) {
  const isPass = scenarios[i].action === "PASS";
  console.log(`--- ACTION: ${scenarios[i].action} ---`);
  const { intervalDays, nextQuizToRender } = gradeAttempt(isPass);
  console.log(`Interval Set: ${intervalDays} days`);
  console.log(`New DB Level: ${srsItem.currentLevel}`);
  console.log(`DB quiz6DocId: ${srsItem.quiz6DocId}`);
  console.log(`DB quiz7DocId: ${srsItem.quiz7DocId}`);
  console.log(`Next quiz frontend will show: ${nextQuizToRender}`);
  console.log();
}
