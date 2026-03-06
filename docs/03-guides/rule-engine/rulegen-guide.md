# RuleGen Guide

`muonroi-rule` is the current RuleGen CLI.

## Commands

- `extract`
- `verify`
- `register`
- `generate-tests`
- `merge`
- `split`
- `watch`

## Attribute model

Rule extraction is centered on `[MExtractAsRule(...)]`.

Typical metadata:

- rule code
- `Order`
- `HookPoint`
- `DependsOn`

## Common workflow

```bash
muonroi-rule extract --source src/Handlers --output Generated/Rules
muonroi-rule verify --source-dir src/Handlers
muonroi-rule register --rules Generated/Rules --output Generated/MGeneratedRuleRegistrationExtensions.g.cs
```

## Runtime round-trip commands

Merge runtime or generated rules into a target class:

```bash
muonroi-rule merge --rules-dir Generated/Rules --target src/Handlers/MyHandler.cs --class MyHandler
```

Split attributed handlers back into rule files:

```bash
muonroi-rule split --source src/Handlers --output Generated/Rules --workflow loan-approval
```

## Watch mode

```bash
muonroi-rule watch --source src/Handlers --output Generated/Rules
```

## Configuration file

The CLI searches for `.rulegenrc.json` in the working directory.

Use it to standardize:

- source directory
- output directory
- namespace override
- class targeting
- generated test scaffolding

## Diagnostics

Rule authoring diagnostics currently include:

- `MRG001` duplicate rule code
- `MRG005` missing dependency reference
- `MRG006` `Order > 1` without dependency graph
- `MRG007` fact consumption without producer dependency
- `MRG008` nullable assignment to non-nullable string
