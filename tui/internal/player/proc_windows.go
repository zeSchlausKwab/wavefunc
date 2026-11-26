//go:build windows

package player

import "os/exec"

func configureProcGroup(_ *exec.Cmd) {}

func killProcGroup(cmd *exec.Cmd) {
	if cmd == nil || cmd.Process == nil {
		return
	}
	_ = cmd.Process.Kill()
}
