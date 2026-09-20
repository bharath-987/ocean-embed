/**
 * KYOGRE — Indian Ocean AI Digital Twin
 * SIH26066 — OceanEmbed
 * Team NeuroTide, Kumaraguru College of Technology
 *
 * Core TypeScript definitions for telemetry, descent strata,
 * research console, and validation metrics.
 */

export interface TelemetryState {
  depth: number; // 0 to 1000m
  waterTemp: number; // calculated T(z) in °C
  progress: number; // 0.0 to 1.0 (scroll progress)
  currentPhase: 'sky' | 'surface' | 'sunbeams' | 'mesopelagic' | 'abyss' | 'reconstruction';
}

export interface SatelliteInput {
  id: string;
  symbol: string;
  name: string;
  source: string;
  description: string;
}

export interface ValidationMetric {
  label: string;
  value: string;
  unit: string;
  description: string;
  isPlaceholder?: boolean;
}

export interface PipelineStage {
  step: string;
  title: string;
  subtitle: string;
  details: string;
  status: 'ingested' | 'preprocessed' | 'inferred' | 'validated' | 'active';
}

export interface ApplicationCard {
  id: string;
  code: string;
  title: string;
  parameter: string;
  description: string;
}

export interface RoadmapPhase {
  phase: string;
  title: string;
  organization: string;
  description: string;
  status: 'planned' | 'prototype' | 'roadmap';
}

export interface ConsoleSettings {
  selectedDepth: number;
  showArgoFloats: boolean;
  showIsotherms: boolean;
  showEkmanVelocity: boolean;
  activeCell: {
    name: string;
    coordinates: string;
    predictedTemp: number;
    confidenceInterval: number;
  };
}
