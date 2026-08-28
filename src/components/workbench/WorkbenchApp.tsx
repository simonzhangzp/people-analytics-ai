"use client";

import { AICoDesignerPanel } from "./AICoDesignerPanel";
import { DataRail } from "./DataRail";
import { WorkbenchProvider, useWorkbench } from "./WorkbenchProvider";
import { WorkbenchShell } from "./WorkbenchShell";
import { DataCanvas } from "./data/DataCanvas";
import { MetricStudio } from "./metrics/MetricStudio";
import { AnalysisCanvas } from "./analysis/AnalysisCanvas";
import { StoryBuilder } from "./story/StoryBuilder";

export function WorkbenchApp({ workspaceId }: { workspaceId: string }) {
  return (
    <WorkbenchProvider workspaceId={workspaceId}>
      <WorkbenchContent />
    </WorkbenchProvider>
  );
}

function WorkbenchContent() {
  const {
    state,
    activeDatasetId,
    draftQuestion,
    processing,
    processingMessage,
    busy,
    error,
    setDraftQuestion,
    setActiveDatasetId,
    setActiveView,
    approveRelationship,
    addFiles,
    askQuestion,
    resolveAmbiguity,
    requestMetricPatch,
    applyMetricPatch,
    cancelMetricPatch,
    runAnalysis,
    runBranch,
    toggleInsightStory,
    buildStory,
    exportStory,
    submitCoDesignerContext,
    handleInterventionAction,
  } = useWorkbench();

  const activeMetric =
    state.metrics.find((metric) => metric.id === state.activeMetricId) ??
    state.metrics[0];
  const selectedForStory = state.insights.filter(
    (insight) => insight.selectedForExecutiveStory,
  ).length;
  const activeDataset =
    state.datasets.find(({ metadata }) => metadata.id === activeDatasetId) ??
    state.datasets[0];

  const dataRail = (
    <DataRail
      activeView={state.activeView}
      onViewChange={setActiveView}
      datasets={state.datasets}
      progress={state.progress}
      activeDatasetId={activeDataset?.metadata.id}
      onSelectDataset={setActiveDatasetId}
    />
  );
  const aiPanel = (
    <AICoDesignerPanel
      interventions={state.interventions}
      busy={busy}
      onSubmitContext={submitCoDesignerContext}
      onAction={handleInterventionAction}
    />
  );

  return (
    <WorkbenchShell
      workspaceName={state.workspaceName}
      engineStatus={state.engineStatus}
      persistenceStatus={state.persistenceStatus}
      storyCount={selectedForStory}
      dataRail={dataRail}
      aiPanel={aiPanel}
      onOpenStory={() => setActiveView("story")}
    >
      {state.activeView === "data" && (
        <DataCanvas
          datasets={state.datasets}
          mappings={state.fieldMappings}
          relationships={state.relationships}
          capabilities={state.capabilities}
          activeDatasetId={activeDataset?.metadata.id}
          processing={processing}
          processingMessage={processingMessage}
          error={error}
          questionText={draftQuestion}
          questionAsked={Boolean(state.question)}
          onAddFiles={addFiles}
          onSelectDataset={setActiveDatasetId}
          onQuestionTextChange={setDraftQuestion}
          onAskQuestion={() => void askQuestion()}
          onContinue={() => setActiveView("metrics")}
          onApproveRelationship={approveRelationship}
        />
      )}

      {state.activeView === "metrics" && (
        <MetricStudio
          metric={activeMetric}
          ambiguity={state.ambiguity}
          pendingPatch={state.pendingMetricPatch}
          busy={busy}
          onResolveAmbiguity={resolveAmbiguity}
          onRequestPatch={requestMetricPatch}
          onApplyPatch={() => void applyMetricPatch()}
          onCancelPatch={cancelMetricPatch}
          onContinue={() => setActiveView("analysis")}
        />
      )}

      {state.activeView === "analysis" && (
        <AnalysisCanvas
          question={state.question}
          plan={state.analysisPlan}
          insights={state.insights}
          running={busy}
          explorationRows={activeDataset?.explorationRows ?? []}
          explorationColumns={activeDataset?.metadata.columns ?? []}
          explorationSource={activeDataset?.metadata.name ?? "No local dataset"}
          explorationSampled={
            (activeDataset?.metadata.rowCount ?? 0) >
            (activeDataset?.explorationRows.length ?? 0)
          }
          onRunPlan={runAnalysis}
          onRunBranch={runBranch}
          onToggleStory={toggleInsightStory}
          onContinueToStory={() => setActiveView("story")}
        />
      )}

      {state.activeView === "story" && (
        <StoryBuilder
          insights={state.insights}
          story={state.story}
          busy={busy}
          onToggleInsight={toggleInsightStory}
          onBuildStory={buildStory}
          onExport={exportStory}
        />
      )}
    </WorkbenchShell>
  );
}

