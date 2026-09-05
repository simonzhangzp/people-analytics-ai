"use client";

import { DataRail } from "./DataRail";
import { WorkbenchProvider, useWorkbench } from "./WorkbenchProvider";
import { WorkbenchShell } from "./WorkbenchShell";
import { AnalyzeCanvas } from "./analysis/AnalyzeCanvas";
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
    localDataAvailable,
    draftQuestion,
    processing,
    processingMessage,
    busy,
    error,
    setDraftQuestion,
    setActiveDatasetId,
    setActiveView,
    addFiles,
    askQuestion,
    resolveAmbiguity,
    toggleInsightStory,
    buildStory,
    exportStory,
  } = useWorkbench();

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
      localDataAvailable={localDataAvailable}
      progress={state.progress}
      activeDatasetId={activeDataset?.metadata.id}
      onSelectDataset={setActiveDatasetId}
    />
  );
  return (
    <WorkbenchShell
      workspaceName={state.workspaceName}
      engineStatus={state.engineStatus}
      persistenceStatus={state.persistenceStatus}
      storyCount={selectedForStory}
      dataRail={dataRail}
      onOpenStory={() => setActiveView("story")}
    >
      {state.activeView !== "story" && (
        <AnalyzeCanvas
          datasets={state.datasets}
          capabilities={state.capabilities}
          activeDatasetId={activeDataset?.metadata.id}
          localDataAvailable={localDataAvailable}
          processing={processing}
          processingMessage={processingMessage}
          busy={busy}
          error={error}
          questionText={draftQuestion}
          thread={state.thread}
          insights={state.insights}
          ambiguity={state.ambiguity}
          plan={state.analysisPlan}
          onAddFiles={addFiles}
          onSelectDataset={setActiveDatasetId}
          onQuestionTextChange={setDraftQuestion}
          onAskQuestion={(questionText, parentTurnId) =>
            void askQuestion(questionText, parentTurnId)
          }
          onResolveAmbiguity={resolveAmbiguity}
          onToggleStory={toggleInsightStory}
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

