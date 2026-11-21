import { afterEach, describe, expect, it } from "vitest";

import { resetLanguageForTest, setLanguage, translate } from "@/i18n/language";
import zhCN from "@/i18n/locales/zh-CN.json";

import {
  resolveRuntimeModelLabel,
  runtimeModelLabels,
  withDisambiguatedModelLabels,
} from "./use-agent-model-selection";

afterEach(() => resetLanguageForTest());

describe("runtimeModelLabels", () => {
  const m = (id: string, label: string) => ({ id, label });

  it.each([
    [
      "keeps unique labels untouched",
      [m("claude-sonnet-4", "Claude Sonnet 4"), m("gpt-5.4", "GPT-5.4")],
      [
        ["claude-sonnet-4", "Claude Sonnet 4"],
        ["gpt-5.4", "GPT-5.4"],
      ],
    ],
    [
      "appends ID only to entries sharing a label",
      [
        m("server/group/wb-gpt-5.5", "WorkBuddy Site"),
        m("server/group/wb-glm-5.3", "WorkBuddy Site"),
        m("claude-sonnet-4", "Claude Sonnet 4"),
      ],
      [
        ["server/group/wb-gpt-5.5", "WorkBuddy Site (server/group/wb-gpt-5.5)"],
        ["server/group/wb-glm-5.3", "WorkBuddy Site (server/group/wb-glm-5.3)"],
        ["claude-sonnet-4", "Claude Sonnet 4"],
      ],
    ],
    [
      "treats whitespace-trimmed matches as collisions",
      [m("model-a", "Relay Model"), m("model-b", "  Relay Model  ")],
      [
        ["model-a", "Relay Model (model-a)"],
        ["model-b", "Relay Model (model-b)"],
      ],
    ],
    [
      "falls back to model ID when label is blank",
      [m("server/wb-gpt-5.5", ""), m("server/wb-glm-5.3", "   ")],
      [
        ["server/wb-gpt-5.5", "server/wb-gpt-5.5"],
        ["server/wb-glm-5.3", "server/wb-glm-5.3"],
      ],
    ],
    [
      "avoids repeating ID when colliding label already equals ID",
      [m("workbuddy", "workbuddy"), m("proxy/workbuddy-2", "workbuddy")],
      [
        ["workbuddy", "workbuddy"],
        ["proxy/workbuddy-2", "workbuddy (proxy/workbuddy-2)"],
      ],
    ],
    [
      "ignores repeated entries with the same ID",
      [m("gpt-5.4", "GPT-5.4"), m("gpt-5.4", "GPT-5.4")],
      [["gpt-5.4", "GPT-5.4"]],
    ],
    [
      "resolves secondary collisions from disambiguation suffixes",
      [
        m("model-a", "Relay Model"),
        m("model-b", "Relay Model"),
        m("model-c", "Relay Model (model-a)"),
      ],
      [
        ["model-a", "Relay Model (model-a)"],
        ["model-b", "Relay Model (model-b)"],
        ["model-c", "Relay Model (model-a) (model-c)"],
      ],
    ],
    [
      "falls back to distinct IDs when colliding labels match suffixes",
      [m("a", "x (a)"), m("x (a)", "x (a)")],
      [
        ["a", "a"],
        ["x (a)", "x (a)"],
      ],
    ],
  ])("%s", (_name, input, expected) => {
    expect([...runtimeModelLabels(input).entries()]).toEqual(expected);
  });

  it("disambiguates against translated stand-in default model labels", async () => {
    await setLanguage("zh-CN");
    const translated = zhCN.runtimeModel.hostDefault.replace("{app}", "Codex");
    const labels = runtimeModelLabels(
      [
        m("codex-default", "Codex default"),
        m("custom/codex-default", translated),
      ],
      translate,
    );
    expect([...labels.entries()]).toEqual([
      ["codex-default", `${translated} (codex-default)`],
      ["custom/codex-default", `${translated} (custom/codex-default)`],
    ]);
  });
});

describe("withDisambiguatedModelLabels & resolveRuntimeModelLabel", () => {
  it("preserves metadata and resolves disambiguated labels", () => {
    const models = withDisambiguatedModelLabels([
      {
        id: "server/group/wb-gpt-5.5",
        label: "WorkBuddy Site",
        allowed_reasoning_effort: ["low", "high"] as const,
      },
      {
        id: "server/group/wb-glm-5.3",
        label: "WorkBuddy Site",
        allowed_reasoning_effort: ["medium"] as const,
      },
      { id: "claude-sonnet-4", label: "Claude Sonnet 4" },
    ]);

    expect(models).toEqual([
      {
        id: "server/group/wb-gpt-5.5",
        label: "WorkBuddy Site (server/group/wb-gpt-5.5)",
        allowed_reasoning_effort: ["low", "high"],
      },
      {
        id: "server/group/wb-glm-5.3",
        label: "WorkBuddy Site (server/group/wb-glm-5.3)",
        allowed_reasoning_effort: ["medium"],
      },
      { id: "claude-sonnet-4", label: "Claude Sonnet 4" },
    ]);
    expect(resolveRuntimeModelLabel(models, "server/group/wb-gpt-5.5")).toBe(
      "WorkBuddy Site (server/group/wb-gpt-5.5)",
    );
    expect(resolveRuntimeModelLabel(models, "claude-sonnet-4")).toBe(
      "Claude Sonnet 4",
    );
    expect(resolveRuntimeModelLabel(models, "missing")).toBeUndefined();
    expect(
      resolveRuntimeModelLabel(undefined, "claude-sonnet-4"),
    ).toBeUndefined();
    expect(resolveRuntimeModelLabel(models, undefined)).toBeUndefined();
  });
});
