package logger

import (
	"fmt"
	"io"
	"os"
	"strings"
)

type Level int

const (
	LevelError Level = iota
	LevelInfo
	LevelDebug
)

var current Level = LevelError
var out io.Writer = os.Stderr

// Init reads ONEC_LOG_LEVEL and ONEC_LOG_FILE from environment.
// ONEC_LOG_LEVEL: error (default) | info | debug
// ONEC_LOG_FILE: path to log file (append mode); if empty — stderr only
func Init() {
	switch strings.ToLower(os.Getenv("ONEC_LOG_LEVEL")) {
	case "debug":
		current = LevelDebug
	case "info":
		current = LevelInfo
	default:
		current = LevelError
	}

	if logFile := os.Getenv("ONEC_LOG_FILE"); logFile != "" {
		f, err := os.OpenFile(logFile, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
		if err != nil {
			fmt.Fprintf(os.Stderr, "[1c-debug] [ERROR] failed to open log file %s: %v\n", logFile, err)
		} else {
			out = io.MultiWriter(os.Stderr, f)
		}
	}
}

func Error(format string, args ...interface{}) {
	log("ERROR", format, args...)
}

func Info(format string, args ...interface{}) {
	if current >= LevelInfo {
		log("INFO", format, args...)
	}
}

func Debug(format string, args ...interface{}) {
	if current >= LevelDebug {
		log("DEBUG", format, args...)
	}
}

func log(level, format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	fmt.Fprintf(out, "[1c-debug] [%s] %s\n", level, msg)
}
