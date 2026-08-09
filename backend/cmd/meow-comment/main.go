package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"moew-comment/backend/internal/admin"
	"moew-comment/backend/internal/config"
	"moew-comment/backend/internal/httpapi"
	"moew-comment/backend/internal/store"
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
	adminKey, err := admin.LoadOrCreateKey(cfg.AdminKeyFile)
	if err != nil {
		logger.Printf("admin key load failed error=%v", err)
		return err
	}

	webServer := &http.Server{
		Addr:              cfg.Listen,
		Handler:           loggingHandler(logger, application.Handler()),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	adminServer := &http.Server{
		Addr:              cfg.AdminListen,
		Handler:           loggingHandler(logger, admin.NewHandler(database, adminKey)),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	serverErrors := make(chan serverError, 2)
	logger.Printf(
		"starting servers listen=%s admin_listen=%s db=%s captcha_enabled=%t allowed_sites_enabled=%t allowed_sites=%d",
		cfg.Listen,
		cfg.AdminListen,
		cfg.DBPath,
		cfg.CaptchaEnabled,
		cfg.AllowedSitesEnabled,
		len(cfg.AllowedSites),
	)
	go func() {
		logger.Printf("server listening address=%s", cfg.Listen)
		serverErrors <- serverError{name: "public", err: webServer.ListenAndServe()}
	}()
	go func() {
		logger.Printf("admin server listening address=%s", cfg.AdminListen)
		serverErrors <- serverError{name: "admin", err: adminServer.ListenAndServe()}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(stop)

	select {
	case event := <-serverErrors:
		if !errors.Is(event.err, http.ErrServerClosed) {
			logger.Printf("%s server stopped with error=%v", event.name, event.err)
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			if shutdownErr := shutdownServers(ctx, webServer, adminServer); shutdownErr != nil {
				logger.Printf("server shutdown failed error=%v", shutdownErr)
			}
			return fmt.Errorf("run %s server: %w", event.name, event.err)
		}
	case <-stop:
		logger.Printf("shutdown signal received")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := shutdownServers(ctx, webServer, adminServer); err != nil {
			logger.Printf("server shutdown failed error=%v", err)
			return fmt.Errorf("shutdown servers: %w", err)
		}
	}
	logger.Printf("servers stopped")

	return nil
}

type serverError struct {
	name string
	err  error
}

func shutdownServers(ctx context.Context, servers ...*http.Server) error {
	var firstErr error
	for _, server := range servers {
		if err := server.Shutdown(ctx); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
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

func printUsage() {
	fmt.Fprintln(os.Stderr, "Usage:")
	fmt.Fprintln(os.Stderr, "  meow-comment serve --config config.json")
	fmt.Fprintln(os.Stderr, "  meow-commentctl token create --config config.json")
	fmt.Fprintln(os.Stderr, "  meow-commentctl token list --config config.json")
	fmt.Fprintln(os.Stderr, "  meow-commentctl token delete --config config.json --name blog")
}
