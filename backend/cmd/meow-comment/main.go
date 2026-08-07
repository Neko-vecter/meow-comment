package main

import (
	"bufio"
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"moew-comment/backend/internal/config"
	"moew-comment/backend/internal/httpapi"
	"moew-comment/backend/internal/store"
	"moew-comment/backend/internal/token"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) == 0 {
		printUsage()
		return errors.New("a command is required")
	}

	switch args[0] {
	case "serve":
		return runServe(args[1:])
	case "token":
		return runToken(args[1:])
	case "help", "-h", "--help":
		printUsage()
		return nil
	default:
		printUsage()
		return fmt.Errorf("unknown command: %s", args[0])
	}
}

func runServe(args []string) error {
	flags := flag.NewFlagSet("serve", flag.ContinueOnError)
	configPath := flags.String("config", "config.json", "path to JSON config")
	if err := flags.Parse(args); err != nil {
		return err
	}

	logger := log.New(os.Stdout, "[meow-comment] ", log.LstdFlags|log.LUTC)
	logger.Printf("loading config path=%s", *configPath)

	cfg, err := config.Load(*configPath)
	if err != nil {
		logger.Printf("config load failed error=%v", err)
		return err
	}

	database, err := store.Open(cfg.DBPath)
	if err != nil {
		logger.Printf("database open failed error=%v", err)
		return err
	}
	defer database.Close()

	application := httpapi.New(cfg, database)
	defer application.Close()

	webServer := &http.Server{
		Addr:              cfg.Listen,
		Handler:           loggingHandler(logger, application.Handler()),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	serverErrors := make(chan error, 1)
	logger.Printf(
		"starting server listen=%s db=%s captcha_enabled=%t allowed_sites_enabled=%t allowed_sites=%d",
		cfg.Listen,
		cfg.DBPath,
		cfg.CaptchaEnabled,
		cfg.AllowedSitesEnabled,
		len(cfg.AllowedSites),
	)
	go func() {
		logger.Printf("server listening address=%s", cfg.Listen)
		serverErrors <- webServer.ListenAndServe()
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(stop)

	select {
	case err := <-serverErrors:
		if !errors.Is(err, http.ErrServerClosed) {
			logger.Printf("server stopped with error=%v", err)
			return fmt.Errorf("run server: %w", err)
		}
	case <-stop:
		logger.Printf("shutdown signal received")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := webServer.Shutdown(ctx); err != nil {
			logger.Printf("server shutdown failed error=%v", err)
			return fmt.Errorf("shutdown server: %w", err)
		}
	}
	logger.Printf("server stopped")

	return nil
}

type loggingResponseWriter struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
}

func (w *loggingResponseWriter) WriteHeader(status int) {
	if w.wroteHeader {
		return
	}
	w.status = status
	w.wroteHeader = true
	w.ResponseWriter.WriteHeader(status)
}

func (w *loggingResponseWriter) Write(body []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(body)
}

func loggingHandler(logger *log.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		response := &loggingResponseWriter{
			ResponseWriter: w,
			status:         http.StatusOK,
		}

		next.ServeHTTP(response, r)

		logger.Printf(
			"request method=%s path=%s status=%d duration=%s remote=%s",
			r.Method,
			r.URL.Path,
			response.status,
			time.Since(started).Round(time.Microsecond),
			r.RemoteAddr,
		)
	})
}

func runToken(args []string) error {
	if len(args) == 0 {
		return errors.New("token command is required: create or delete")
	}

	switch args[0] {
	case "create":
		return runTokenCreate(args[1:])
	case "delete":
		return runTokenDelete(args[1:])
	default:
		return fmt.Errorf("unknown token command: %s", args[0])
	}
}

func runTokenCreate(args []string) error {
	flags := flag.NewFlagSet("token create", flag.ContinueOnError)
	configPath := flags.String("config", "config.json", "path to JSON config")
	name := flags.String("name", "", "token key name")
	if err := flags.Parse(args); err != nil {
		return err
	}

	keyName := strings.TrimSpace(*name)
	if keyName == "" {
		reader := bufio.NewReader(os.Stdin)
		fmt.Fprint(os.Stdout, "key name: ")
		value, err := reader.ReadString('\n')
		if err != nil && len(value) == 0 {
			return fmt.Errorf("read key name: %w", err)
		}
		keyName = strings.TrimSpace(value)
	}
	if keyName == "" {
		return errors.New("key name is required")
	}

	cfg, err := config.Load(*configPath)
	if err != nil {
		return err
	}
	database, err := store.Open(cfg.DBPath)
	if err != nil {
		return err
	}
	defer database.Close()

	rawToken, err := token.Generate()
	if err != nil {
		return fmt.Errorf("generate token: %w", err)
	}
	created, err := database.CreateToken(keyName, rawToken)
	if err != nil {
		return fmt.Errorf("create token: %w", err)
	}

	fmt.Fprintf(os.Stdout, "name: %s\n", created.Name)
	fmt.Fprintf(os.Stdout, "id: %s\n", created.ID)
	fmt.Fprintf(os.Stdout, "token: %s\n", rawToken)
	return nil
}

func runTokenDelete(args []string) error {
	flags := flag.NewFlagSet("token delete", flag.ContinueOnError)
	configPath := flags.String("config", "config.json", "path to JSON config")
	name := flags.String("name", "", "token key name")
	tokenID := flags.String("id", "", "token id")
	if err := flags.Parse(args); err != nil {
		return err
	}

	trimmedName := strings.TrimSpace(*name)
	trimmedID := strings.TrimSpace(*tokenID)
	if (trimmedName == "") == (trimmedID == "") {
		return errors.New("exactly one of --name or --id is required")
	}

	cfg, err := config.Load(*configPath)
	if err != nil {
		return err
	}
	database, err := store.Open(cfg.DBPath)
	if err != nil {
		return err
	}
	defer database.Close()

	if err := database.DeleteToken(trimmedName, trimmedID); err != nil {
		return fmt.Errorf("delete token: %w", err)
	}

	fmt.Fprintln(os.Stdout, "token deleted")
	return nil
}

func printUsage() {
	fmt.Fprintln(os.Stderr, "Usage:")
	fmt.Fprintln(os.Stderr, "  meow-comment serve --config config.json")
	fmt.Fprintln(os.Stderr, "  meow-comment token create --config config.json")
	fmt.Fprintln(os.Stderr, "  meow-comment token delete --config config.json --name blog")
	fmt.Fprintln(os.Stderr, "  meow-comment token delete --config config.json --id TOKEN_ID")
}
