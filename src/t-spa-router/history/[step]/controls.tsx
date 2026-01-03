"use client";
import { useRouter } from "dinou"; // Ajusta el import a tu framework

export default function Controls({ currentStep }: { currentStep: string }) {
  const router = useRouter();
  const nextStep = parseInt(currentStep) + 1;

  return (
    <div
      style={{ border: "1px solid #ccc", padding: "10px", marginTop: "10px" }}
    >
      <p>
        Current Step: <span id="step-display">{currentStep}</span>
      </p>

      <button
        id="btn-next"
        onClick={() => router.push(`/t-spa-router/history/${nextStep}`)}
      >
        Go Next
      </button>

      <div style={{ marginTop: "10px", gap: "10px", display: "flex" }}>
        <button id="btn-back" onClick={() => router.back()}>
          ⬅ Back
        </button>
        <button id="btn-forward" onClick={() => router.forward()}>
          Forward ➡
        </button>
      </div>
    </div>
  );
}
