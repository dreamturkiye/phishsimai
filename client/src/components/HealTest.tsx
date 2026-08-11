// ARCH-FIX: add data-testid so QA automation can locate HealTest on /heal-test
export default function HealTest() {
  return (
    <div data-testid="heal-test-component">
      <h1>Heal Test</h1>
      <p>Component available for e2e certification.</p>
    </div>
  );
}