import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveOrg } from "@/contexts/OrgContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useState } from "react";
import { toast } from "sonner";
import { BookOpen, Clock, CheckCircle2, Lock, Play, Award, Shield } from "lucide-react";

const topicColors: Record<string, string> = {
  compliance: "bg-blue-500/10 text-blue-400",
  security: "bg-violet-500/10 text-violet-400",
  awareness: "bg-emerald-500/10 text-emerald-400",
  technical: "bg-amber-500/10 text-amber-400",
};

export default function Training() {
  const { isAuthenticated } = useAuth();
  const [activeModule, setActiveModule] = useState<any | null>(null);
  const [quizAnswer, setQuizAnswer] = useState<number | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [score, setScore] = useState(0);

  const { data: orgsData } = trpc.orgs.myOrgs.useQuery(undefined, { enabled: isAuthenticated });
  const { orgId } = useActiveOrg();

  const { data: modules } = trpc.training.modules.useQuery({});
  const { data: completions, refetch: refetchCompletions } = trpc.training.completions.useQuery(
    { orgId: orgId! },
    { enabled: !!orgId }
  );

  const completeMutation = trpc.training.complete.useMutation({
    onSuccess: () => {
      toast.success("Module completed! Great work.");
      refetchCompletions();
      setActiveModule(null);
      setQuizAnswer(null);
      setQuizSubmitted(false);
      setScore(0);
    },
    onError: (e) => toast.error(e.message),
  });

  const completedIds = new Set((completions ?? []).map(c => c.moduleId));
  const completedCount = completedIds.size;
  const totalCount = modules?.length ?? 0;
  const completionPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleStartModule = (mod: any) => {
    setActiveModule(mod);
    setQuizAnswer(null);
    setQuizSubmitted(false);
    setScore(0);
  };

  const handleSubmitQuiz = () => {
    if (quizAnswer === null) return;
    const correct = quizAnswer === activeModule.quizCorrectIndex;
    const finalScore = correct ? 100 : 50;
    setScore(finalScore);
    setQuizSubmitted(true);
  };

  const handleComplete = () => {
    completeMutation.mutate({
      orgId: orgId!,
      moduleId: activeModule.id,
      score,
      timeSpentSeconds: activeModule.durationMinutes * 60,
    });
  };

  return (
    <AppLayout title="Security Training">
      <div className="space-y-6">
        {/* Progress overview */}
        <Card className="border-border/60 bg-gradient-to-r from-primary/5 to-violet-500/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-lg">Your Training Progress</h2>
                <p className="text-sm text-muted-foreground">{completedCount} of {totalCount} modules completed</p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-primary">{completionPct}%</div>
                <div className="text-xs text-muted-foreground">Complete</div>
              </div>
            </div>
            <Progress value={completionPct} className="h-2" />
          </CardContent>
        </Card>

        {/* Module grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(modules ?? []).map((mod: any) => {
            const isCompleted = completedIds.has(mod.id);
            const topicColor = topicColors[mod.topic] ?? "bg-slate-500/10 text-slate-400";

            return (
              <Card
                key={mod.id}
                className={`border-border/60 hover:border-primary/30 transition-all group cursor-pointer ${isCompleted ? "opacity-80" : ""}`}
                onClick={() => handleStartModule(mod)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-10 h-10 rounded-lg ${topicColor} flex items-center justify-center`}>
                      {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : <BookOpen className="w-5 h-5" />}
                    </div>
                    {isCompleted && (
                      <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs">
                        <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
                        Done
                      </Badge>
                    )}
                  </div>

                  <h3 className="font-semibold text-sm mb-1">{mod.title}</h3>
                  <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{mod.description}</p>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {mod.durationMinutes} min
                      </span>
                      <Badge variant="secondary" className={`text-xs h-4 px-1.5 ${topicColor}`}>
                        {mod.topic}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      variant={isCompleted ? "outline" : "default"}
                      className="h-7 px-3 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); handleStartModule(mod); }}
                    >
                      {isCompleted ? "Review" : <><Play className="w-2.5 h-2.5 mr-1" />Start</>}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {modules?.length === 0 && (
          <Card className="border-border/60">
            <CardContent className="py-16 text-center">
              <BookOpen className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="font-semibold mb-2">No training modules available</h3>
              <p className="text-sm text-muted-foreground">Training modules will appear here once configured.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Module viewer dialog */}
      <Dialog open={!!activeModule} onOpenChange={() => setActiveModule(null)}>
        <DialogContent className="sm:max-w-2xl bg-card border-border/60 max-h-[90vh] overflow-y-auto">
          {activeModule && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="secondary" className="text-xs">{activeModule.topic}</Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />{activeModule.durationMinutes} min
                  </span>
                </div>
                <DialogTitle>{activeModule.title}</DialogTitle>
              </DialogHeader>

              <div className="space-y-6 py-2">
                {/* Content */}
                <div className="prose prose-sm prose-invert max-w-none">
                  <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {activeModule.content}
                  </div>
                </div>

                {/* Key points */}
                {activeModule.keyPoints && activeModule.keyPoints.length > 0 && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-primary" />
                      Key Takeaways
                    </h4>
                    <ul className="space-y-2">
                      {activeModule.keyPoints.map((point: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Quiz */}
                {activeModule.quizQuestion && (
                  <div className="rounded-lg border border-border/60 p-4">
                    <h4 className="font-semibold text-sm mb-3">Quick Check</h4>
                    <p className="text-sm mb-4">{activeModule.quizQuestion}</p>
                    <div className="space-y-2">
                      {(activeModule.quizOptions ?? []).map((opt: string, i: number) => (
                        <button
                          key={i}
                          disabled={quizSubmitted}
                          onClick={() => setQuizAnswer(i)}
                          className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-all ${
                            quizSubmitted
                              ? i === activeModule.quizCorrectIndex
                                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                                : quizAnswer === i
                                  ? "border-red-500/50 bg-red-500/10 text-red-400"
                                  : "border-border/40 text-muted-foreground"
                              : quizAnswer === i
                                ? "border-primary/50 bg-primary/10"
                                : "border-border/60 hover:border-primary/30 hover:bg-accent/50"
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                    {quizSubmitted && (
                      <div className={`mt-3 text-sm font-medium ${score === 100 ? "text-emerald-400" : "text-amber-400"}`}>
                        {score === 100 ? "✓ Correct! Well done." : "✗ Not quite — see the correct answer highlighted above."}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setActiveModule(null)}>Close</Button>
                {!quizSubmitted && activeModule.quizQuestion ? (
                  <Button disabled={quizAnswer === null} onClick={handleSubmitQuiz}>
                    Submit Answer
                  </Button>
                ) : (
                  <Button
                    disabled={completeMutation.isPending}
                    onClick={handleComplete}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Award className="w-3.5 h-3.5 mr-1.5" />
                    {completeMutation.isPending ? "Saving..." : "Mark Complete"}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
