# Review log

No subagent review rounds were run: the change is one config file plus a docs
note, the root cause was reproduced with a probe, and subagents were not
requested. The plan's risks (renormalization diff, binary detection, existing
clones) were self-reviewed and each has a detection step. The implementer should
treat step 2 of the plan as the guard against the main residual risk.

| Finding                                                  | Lens       | Severity     | Decision                       |
| -------------------------------------------------------- | ---------- | ------------ | ------------------------------ |
| Wrapper stripping `\r` in compose would mask the problem | simplicity | non-blocking | reject, root cause fix instead |
| CI guard for CRLF is useless (index is already LF)       | testing    | non-blocking | reject                         |
| Existing clones stay broken                              | ops        | important    | docs + recovery commands       |
