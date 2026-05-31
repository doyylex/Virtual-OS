import { useEffect, useRef, useState } from 'react';
import { useSystemSound } from '../hooks/useSystemSound.js';
import { useWindowStore } from '../store/useWindowStore.js';

const calculatorButtons = [
  { label: 'Limpiar', action: 'clear', tone: 'control' },
  { label: 'Borrar', action: 'backspace', tone: 'control', ariaLabel: 'Borrar ultimo digito' },
  { label: '/', action: 'operator', value: '/', tone: 'operator', ariaLabel: 'Dividir' },
  { label: 'x', action: 'operator', value: '*', tone: 'operator', ariaLabel: 'Multiplicar' },
  { label: '7', action: 'digit', value: '7' },
  { label: '8', action: 'digit', value: '8' },
  { label: '9', action: 'digit', value: '9' },
  { label: '-', action: 'operator', value: '-', tone: 'operator', ariaLabel: 'Restar' },
  { label: '4', action: 'digit', value: '4' },
  { label: '5', action: 'digit', value: '5' },
  { label: '6', action: 'digit', value: '6' },
  { label: '+', action: 'operator', value: '+', tone: 'operator', ariaLabel: 'Sumar' },
  { label: '1', action: 'digit', value: '1' },
  { label: '2', action: 'digit', value: '2' },
  { label: '3', action: 'digit', value: '3' },
  { label: 'Raiz', action: 'squareRoot', tone: 'function', ariaLabel: 'Raiz cuadrada' },
  { label: 'Signo', action: 'toggleSign', tone: 'function', ariaLabel: 'Cambiar signo' },
  { label: '0', action: 'digit', value: '0' },
  { label: '.', action: 'decimal', value: '.' },
  { label: '%', action: 'percent', tone: 'function', ariaLabel: 'Porcentaje' },
  { label: '=', action: 'equals', tone: 'equals', ariaLabel: 'Resultado', wide: true },
];

const maxDisplayLength = 13;
const errorMessage = 'Error';

const operationLabels = {
  '+': '+',
  '-': '-',
  '*': '*',
  '/': '/',
};

const calculate = (left, operator, right) => {
  if (operator === '+') {
    return left + right;
  }

  if (operator === '-') {
    return left - right;
  }

  if (operator === '*') {
    return left * right;
  }

  if (operator === '/') {
    if (right === 0) {
      return null;
    }

    return left / right;
  }

  return right;
};

const trimDisplayValue = (value) => {
  if (!Number.isFinite(value)) {
    return errorMessage;
  }

  const fixedValue = Number.parseFloat(value.toPrecision(maxDisplayLength));
  const nextDisplay = String(fixedValue);

  if (nextDisplay.length <= maxDisplayLength) {
    return nextDisplay;
  }

  return fixedValue.toExponential(6);
};

export function CalculatorApp({ windowId }) {
  const calculatorRef = useRef(null);
  const [display, setDisplay] = useState('0');
  const [storedValue, setStoredValue] = useState(null);
  const [pendingOperator, setPendingOperator] = useState(null);
  const [shouldReplaceDisplay, setShouldReplaceDisplay] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [lastOperation, setLastOperation] = useState(null);
  const activeWindowId = useWindowStore((state) => state.activeWindowId);
  const playSound = useSystemSound();

  useEffect(() => {
    if (!windowId || activeWindowId === windowId) {
      calculatorRef.current?.focus({ preventScroll: true });
    }
  }, [activeWindowId, windowId]);

  const resetCalculator = () => {
    setDisplay('0');
    setStoredValue(null);
    setPendingOperator(null);
    setShouldReplaceDisplay(false);
    setHasError(false);
    setLastOperation(null);
  };

  const setCalculationError = () => {
    setDisplay(errorMessage);
    setStoredValue(null);
    setPendingOperator(null);
    setShouldReplaceDisplay(true);
    setHasError(true);
    setLastOperation(null);
    playSound('error');
  };

  const updateDisplayFromNumber = (value, shouldReplace = true) => {
    const nextDisplay = trimDisplayValue(value);

    if (nextDisplay === errorMessage) {
      setCalculationError();
      return false;
    }

    setDisplay(nextDisplay);
    setShouldReplaceDisplay(shouldReplace);
    setHasError(false);
    return true;
  };

  const commitPendingOperation = (nextOperator) => {
    const currentValue = Number(display);

    if (pendingOperator && storedValue !== null && !shouldReplaceDisplay) {
      const result = calculate(storedValue, pendingOperator, currentValue);

      if (result === null) {
        setCalculationError();
        return;
      }

      if (!updateDisplayFromNumber(result)) {
        return;
      }

      setStoredValue(result);
    } else {
      setStoredValue(currentValue);
    }

    setPendingOperator(nextOperator);
    setShouldReplaceDisplay(true);
    setHasError(false);
    playSound('click');
  };

  const handleDigit = (digit) => {
    if (hasError || shouldReplaceDisplay || display === '0') {
      if (shouldReplaceDisplay && !pendingOperator) {
        setLastOperation(null);
      }

      setDisplay(digit);
      setShouldReplaceDisplay(false);
      setHasError(false);
      playSound('click');
      return;
    }

    if (display.replace('-', '').replace('.', '').length >= maxDisplayLength) {
      return;
    }

    setDisplay(`${display}${digit}`);
    playSound('click');
  };

  const handleDecimal = () => {
    if (hasError || shouldReplaceDisplay) {
      if (shouldReplaceDisplay && !pendingOperator) {
        setLastOperation(null);
      }

      setDisplay('0.');
      setShouldReplaceDisplay(false);
      setHasError(false);
      playSound('click');
      return;
    }

    if (!display.includes('.')) {
      setDisplay(`${display}.`);
      playSound('click');
    }
  };

  const handleBackspace = () => {
    if (hasError || shouldReplaceDisplay || display.length <= 1 || display.slice(0, -1) === '-') {
      setDisplay('0');
      setShouldReplaceDisplay(false);
      setHasError(false);
      playSound('click');
      return;
    }

    setDisplay(display.slice(0, -1));
    playSound('click');
  };

  const handleEquals = () => {
    const currentValue = Number(display);

    if (!pendingOperator || storedValue === null) {
      if (lastOperation) {
        const repeatedResult = calculate(currentValue, lastOperation.operator, lastOperation.value);

        if (repeatedResult === null) {
          setCalculationError();
          return;
        }

        if (updateDisplayFromNumber(repeatedResult)) {
          playSound('click');
        }

        return;
      }

      playSound('click');
      return;
    }

    const result = calculate(storedValue, pendingOperator, currentValue);

    if (result === null) {
      setCalculationError();
      return;
    }

    if (!updateDisplayFromNumber(result)) {
      return;
    }

    setStoredValue(null);
    setPendingOperator(null);
    setLastOperation({ operator: pendingOperator, value: currentValue });
    playSound('click');
  };

  const handlePercent = () => {
    if (hasError) {
      return;
    }

    const currentValue = Number(display);
    const percentValue =
      pendingOperator && storedValue !== null
        ? (storedValue * currentValue) / 100
        : currentValue / 100;

    if (updateDisplayFromNumber(percentValue, false)) {
      playSound('click');
    }
  };

  const handleSquareRoot = () => {
    if (hasError) {
      return;
    }

    const currentValue = Number(display);

    if (currentValue < 0) {
      setCalculationError();
      return;
    }

    if (updateDisplayFromNumber(Math.sqrt(currentValue))) {
      playSound('click');
    }
  };

  const handleToggleSign = () => {
    if (hasError || display === '0') {
      return;
    }

    setDisplay(display.startsWith('-') ? display.slice(1) : `-${display}`);
    setShouldReplaceDisplay(false);
    playSound('click');
  };

  const handleButtonClick = (button) => {
    if (button.action === 'clear') {
      resetCalculator();
      playSound('click');
      return;
    }

    if (button.action === 'backspace') {
      handleBackspace();
      return;
    }

    if (button.action === 'digit') {
      handleDigit(button.value);
      return;
    }

    if (button.action === 'decimal') {
      handleDecimal();
      return;
    }

    if (button.action === 'operator') {
      if (hasError) {
        return;
      }

      commitPendingOperation(button.value);
      return;
    }

    if (button.action === 'equals') {
      handleEquals();
      return;
    }

    if (button.action === 'percent') {
      handlePercent();
      return;
    }

    if (button.action === 'squareRoot') {
      handleSquareRoot();
      return;
    }

    if (button.action === 'toggleSign') {
      handleToggleSign();
      return;
    }
  };

  const focusCalculator = () => {
    calculatorRef.current?.focus({ preventScroll: true });
  };

  const handleCalculatorKeyDown = (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      handleDigit(event.key);
      return;
    }

    if (event.key === '.' || event.key === ',') {
      event.preventDefault();
      handleDecimal();
      return;
    }

    if (['+', '-', '*', '/'].includes(event.key)) {
      event.preventDefault();

      if (!hasError) {
        commitPendingOperation(event.key);
      }

      return;
    }

    if (event.key === 'Enter' || event.key === '=') {
      event.preventDefault();
      handleEquals();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      resetCalculator();
      playSound('click');
      return;
    }

    if (event.key === 'Backspace') {
      event.preventDefault();
      handleBackspace();
      return;
    }

    if (event.key === 'Delete') {
      event.preventDefault();
      resetCalculator();
      playSound('click');
      return;
    }
  };

  return (
    <div
      className="ros-calculator-app"
      ref={calculatorRef}
      tabIndex={0}
      aria-label="Calculadora"
      onKeyDown={handleCalculatorKeyDown}
      onPointerDownCapture={focusCalculator}
    >
      <div className="ros-calculator-status" aria-live="polite">
        <span>{pendingOperator ? `${trimDisplayValue(storedValue ?? Number(display))} ${operationLabels[pendingOperator]}` : ' '}</span>
      </div>
      <output className="ros-calculator-display" data-error={hasError ? 'true' : 'false'} aria-label="Pantalla de calculadora">
        {display}
      </output>
      <div className="ros-calculator-keypad" aria-label="Botones de calculadora">
        {calculatorButtons.map((button) => (
          <button
            className="ros-calculator-button"
            data-tone={button.tone ?? 'number'}
            data-wide={button.wide ? 'true' : 'false'}
            key={button.label}
            type="button"
            aria-label={button.ariaLabel ?? button.label}
            title={button.ariaLabel ?? button.label}
            onClick={() => handleButtonClick(button)}
          >
            {button.label}
          </button>
        ))}
      </div>
    </div>
  );
}
