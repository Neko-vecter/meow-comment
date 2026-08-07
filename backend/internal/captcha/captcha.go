package captcha

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"math/big"
	"strings"
	"sync"
	"time"

	"image/draw"

	"moew-comment/backend/internal/id"
)

const (
	codeLength = 4
	codeChars  = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	imageScale = 4
)

type entry struct {
	code      string
	expiresAt time.Time
}

type Store struct {
	mu      sync.Mutex
	items   map[string]entry
	ttl     time.Duration
	stop    chan struct{}
	stopped chan struct{}
}

func NewStore(ttl time.Duration) *Store {
	store := &Store{
		items:   make(map[string]entry),
		ttl:     ttl,
		stop:    make(chan struct{}),
		stopped: make(chan struct{}),
	}

	go store.cleanupLoop()
	return store
}

func (s *Store) Close() {
	close(s.stop)
	<-s.stopped
}

func (s *Store) New() (string, string, error) {
	challengeID, err := id.New()
	if err != nil {
		return "", "", err
	}

	code, err := randomCode()
	if err != nil {
		return "", "", err
	}

	imageData, err := render(code)
	if err != nil {
		return "", "", err
	}

	s.mu.Lock()
	s.items[challengeID] = entry{
		code:      code,
		expiresAt: time.Now().Add(s.ttl),
	}
	s.mu.Unlock()

	return challengeID, base64.StdEncoding.EncodeToString(imageData), nil
}

func (s *Store) VerifyAndConsume(challengeID, value string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	current, ok := s.items[challengeID]
	if !ok {
		return false
	}
	if time.Now().After(current.expiresAt) {
		delete(s.items, challengeID)
		return false
	}
	if !strings.EqualFold(strings.TrimSpace(value), current.code) {
		return false
	}

	delete(s.items, challengeID)
	return true
}

func (s *Store) cleanupLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	defer close(s.stopped)

	for {
		select {
		case <-ticker.C:
			s.removeExpired()
		case <-s.stop:
			return
		}
	}
}

func (s *Store) removeExpired() {
	now := time.Now()

	s.mu.Lock()
	defer s.mu.Unlock()

	for challengeID, current := range s.items {
		if now.After(current.expiresAt) {
			delete(s.items, challengeID)
		}
	}
}

func randomCode() (string, error) {
	code := make([]byte, codeLength)
	for index := range code {
		random, err := rand.Int(rand.Reader, big.NewInt(int64(len(codeChars))))
		if err != nil {
			return "", err
		}
		code[index] = codeChars[random.Int64()]
	}
	return string(code), nil
}

func render(code string) ([]byte, error) {
	const (
		margin   = 12
		glyphGap = 8
	)

	width := margin*2 + len(code)*5*imageScale + (len(code)-1)*glyphGap
	height := margin*2 + 7*imageScale
	canvas := image.NewRGBA(image.Rect(0, 0, width, height))
	draw.Draw(canvas, canvas.Bounds(), &image.Uniform{C: color.RGBA{245, 247, 250, 255}}, image.Point{}, draw.Src)

	for line := 0; line < 5; line++ {
		startX := randomInt(width)
		startY := randomInt(height)
		endX := randomInt(width)
		endY := randomInt(height)
		paintLine(canvas, startX, startY, endX, endY, color.RGBA{170, 190, 215, 180})
	}

	for index := range code {
		pattern, ok := glyphs[code[index]]
		if !ok {
			continue
		}
		startX := margin + index*(5*imageScale+glyphGap)
		for row, line := range pattern {
			for column, pixel := range line {
				if pixel != '1' {
					continue
				}
				paintBlock(
					canvas,
					startX+column*imageScale,
					margin+row*imageScale,
					imageScale,
					color.RGBA{38, 54, 80, 255},
				)
			}
		}
	}

	var output bytes.Buffer
	if err := png.Encode(&output, canvas); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}

func randomInt(maximum int) int {
	if maximum <= 0 {
		return 0
	}
	random, err := rand.Int(rand.Reader, big.NewInt(int64(maximum)))
	if err != nil {
		return 0
	}
	return int(random.Int64())
}

func paintBlock(canvas *image.RGBA, x, y, size int, paint color.Color) {
	for row := 0; row < size; row++ {
		for column := 0; column < size; column++ {
			canvas.Set(x+column, y+row, paint)
		}
	}
}

func paintLine(canvas *image.RGBA, startX, startY, endX, endY int, paint color.Color) {
	deltaX := endX - startX
	deltaY := endY - startY
	steps := deltaX
	if steps < 0 {
		steps = -steps
	}
	if absolute(deltaY) > steps {
		steps = absolute(deltaY)
	}
	if steps == 0 {
		canvas.Set(startX, startY, paint)
		return
	}

	for step := 0; step <= steps; step++ {
		ratio := float64(step) / float64(steps)
		x := startX + int(float64(deltaX)*ratio)
		y := startY + int(float64(deltaY)*ratio)
		canvas.Set(x, y, paint)
	}
}

func absolute(value int) int {
	if value < 0 {
		return -value
	}
	return value
}

var glyphs = map[byte][]string{
	'0': {"01110", "10001", "10011", "10101", "11001", "10001", "01110"},
	'1': {"00100", "01100", "00100", "00100", "00100", "00100", "01110"},
	'2': {"01110", "10001", "00001", "00010", "00100", "01000", "11111"},
	'3': {"11110", "00001", "00001", "01110", "00001", "00001", "11110"},
	'4': {"00010", "00110", "01010", "10010", "11111", "00010", "00010"},
	'5': {"11111", "10000", "10000", "11110", "00001", "00001", "11110"},
	'6': {"01110", "10000", "10000", "11110", "10001", "10001", "01110"},
	'7': {"11111", "00001", "00010", "00100", "01000", "01000", "01000"},
	'8': {"01110", "10001", "10001", "01110", "10001", "10001", "01110"},
	'9': {"01110", "10001", "10001", "01111", "00001", "00001", "01110"},
	'A': {"01110", "10001", "10001", "11111", "10001", "10001", "10001"},
	'B': {"11110", "10001", "10001", "11110", "10001", "10001", "11110"},
	'C': {"01111", "10000", "10000", "10000", "10000", "10000", "01111"},
	'D': {"11110", "10001", "10001", "10001", "10001", "10001", "11110"},
	'E': {"11111", "10000", "10000", "11110", "10000", "10000", "11111"},
	'F': {"11111", "10000", "10000", "11110", "10000", "10000", "10000"},
	'G': {"01111", "10000", "10000", "10111", "10001", "10001", "01111"},
	'H': {"10001", "10001", "10001", "11111", "10001", "10001", "10001"},
	'I': {"01110", "00100", "00100", "00100", "00100", "00100", "01110"},
	'J': {"00111", "00010", "00010", "00010", "00010", "10010", "01100"},
	'K': {"10001", "10010", "10100", "11000", "10100", "10010", "10001"},
	'L': {"10000", "10000", "10000", "10000", "10000", "10000", "11111"},
	'M': {"10001", "11011", "10101", "10101", "10001", "10001", "10001"},
	'N': {"10001", "11001", "10101", "10011", "10001", "10001", "10001"},
	'O': {"01110", "10001", "10001", "10001", "10001", "10001", "01110"},
	'P': {"11110", "10001", "10001", "11110", "10000", "10000", "10000"},
	'Q': {"01110", "10001", "10001", "10001", "10101", "10010", "01101"},
	'R': {"11110", "10001", "10001", "11110", "10100", "10010", "10001"},
	'S': {"01111", "10000", "10000", "01110", "00001", "00001", "11110"},
	'T': {"11111", "00100", "00100", "00100", "00100", "00100", "00100"},
	'U': {"10001", "10001", "10001", "10001", "10001", "10001", "01110"},
	'V': {"10001", "10001", "10001", "10001", "10001", "01010", "00100"},
	'W': {"10001", "10001", "10001", "10101", "10101", "11011", "10001"},
	'X': {"10001", "10001", "01010", "00100", "01010", "10001", "10001"},
	'Y': {"10001", "10001", "01010", "00100", "00100", "00100", "00100"},
	'Z': {"11111", "00001", "00010", "00100", "01000", "10000", "11111"},
}
