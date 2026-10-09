// Versioned model boundary. Scheduling remains in the FSRS service.
const bounds = [
  [0.001, 100],
  [0.001, 100],
  [0.001, 100],
  [0.001, 100],
  [1, 10],
  [0.001, 4],
  [0.001, 4],
  [0.001, 0.75],
  [0, 4.5],
  [0, 0.8],
  [0.001, 3.5],
  [0.001, 5],
  [0.001, 0.25],
  [0.001, 0.9],
  [0, 4],
  [0, 1],
  [1, 6],
  [0, 2],
  [0, 2],
  [0.01, 0.8],
  [0.1, 0.8],
];
export function validWeights(weights) {
  return (
    Array.isArray(weights) &&
    weights.length === 21 &&
    weights.every(
      (n, i) =>
        typeof n === "number" &&
        Number.isFinite(n) &&
        n >= bounds[i][0] - 1e-7 &&
        n <= bounds[i][1] + 1e-7,
    ) &&
    weights.slice(0, 4).every((n) => n > 0) &&
    weights[20] > 0
  );
}

export function parseModel(text, language) {
  const model = JSON.parse(text);
  if (
    !model ||
    model.schemaVersion !== 1 ||
    model.algorithm !== "FSRS-6" ||
    model.language !== language ||
    !validWeights(model.weights) ||
    model.accepted !== true ||
    !Number.isFinite(model.validation?.baselineLogLoss) ||
    !Number.isFinite(model.validation?.candidateLogLoss) ||
    model.validation.candidateLogLoss >= model.validation.baselineLogLoss
  )
    throw new Error("參數檔不適用於目前語言，或尚未通過驗證。");
  return { weights: [...model.weights], trainedAt: model.trainedAt };
}
