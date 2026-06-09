// @vitest-environment happy-dom
//
// Focused test: IntentCapture ATB toggle wiring.
// Renders the component, clicks the checkbox, asserts onUpdatePolicy is called.

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import IntentCapture from '../v4/IntentCapture'

const BASE_POLICY = {
  tokenBudget: 'low',
  verbosity: 'standard',
  useAiToolBridgeForStage1: false,
}

function renderCapture(policy = BASE_POLICY, onUpdatePolicy = vi.fn()) {
  render(
    <IntentCapture
      policy={policy}
      apiKeySet={false}
      onSubmit={vi.fn()}
      onUpdatePolicy={onUpdatePolicy}
    />
  )
  return { onUpdatePolicy }
}

// Helper: Stage 1 checkbox is always first; Stage 2 pivot is second.
function getStage1Checkbox() { return screen.getAllByRole('checkbox')[0] }
function getStage2PivotCheckbox() { return screen.getAllByRole('checkbox')[1] }

describe('IntentCapture — Stage 1 ATB toggle', () => {
  it('renders the checkbox unchecked when useAiToolBridgeForStage1 is false', () => {
    renderCapture()
    expect(getStage1Checkbox().checked).toBe(false)
  })

  it('renders the checkbox checked when useAiToolBridgeForStage1 is true', () => {
    renderCapture({ ...BASE_POLICY, useAiToolBridgeForStage1: true })
    expect(getStage1Checkbox().checked).toBe(true)
  })

  it('calls onUpdatePolicy with { useAiToolBridgeForStage1: true } when checked', () => {
    const { onUpdatePolicy } = renderCapture()
    fireEvent.click(getStage1Checkbox())
    expect(onUpdatePolicy).toHaveBeenCalledOnce()
    expect(onUpdatePolicy).toHaveBeenCalledWith({ useAiToolBridgeForStage1: true })
  })

  it('calls onUpdatePolicy with { useAiToolBridgeForStage1: false } when unchecked', () => {
    const { onUpdatePolicy } = renderCapture({ ...BASE_POLICY, useAiToolBridgeForStage1: true })
    fireEvent.click(getStage1Checkbox())
    expect(onUpdatePolicy).toHaveBeenCalledOnce()
    expect(onUpdatePolicy).toHaveBeenCalledWith({ useAiToolBridgeForStage1: false })
  })

  it('does not render any checkbox when onUpdatePolicy is not provided', () => {
    render(<IntentCapture policy={BASE_POLICY} apiKeySet={false} onSubmit={vi.fn()} />)
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })
})

describe('IntentCapture — Stage 2 pivot ATB toggle', () => {
  it('renders the Stage 2 pivot checkbox unchecked by default', () => {
    renderCapture()
    expect(getStage2PivotCheckbox().checked).toBe(false)
  })

  it('renders the Stage 2 pivot checkbox checked when useAiToolBridgeForStage2Pivot is true', () => {
    renderCapture({ ...BASE_POLICY, useAiToolBridgeForStage2Pivot: true })
    expect(getStage2PivotCheckbox().checked).toBe(true)
  })

  it('calls onUpdatePolicy with { useAiToolBridgeForStage2Pivot: true } when checked', () => {
    const { onUpdatePolicy } = renderCapture()
    fireEvent.click(getStage2PivotCheckbox())
    expect(onUpdatePolicy).toHaveBeenCalledWith({ useAiToolBridgeForStage2Pivot: true })
  })

  it('calls onUpdatePolicy with { useAiToolBridgeForStage2Pivot: false } when unchecked', () => {
    const { onUpdatePolicy } = renderCapture({ ...BASE_POLICY, useAiToolBridgeForStage2Pivot: true })
    fireEvent.click(getStage2PivotCheckbox())
    expect(onUpdatePolicy).toHaveBeenCalledWith({ useAiToolBridgeForStage2Pivot: false })
  })
})
