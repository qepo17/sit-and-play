package main

import (
	"errors"
	"os"
	"strconv"
	"strings"
)

// vdf is a section of a Valve KeyValues text file, the format of Steam's
// own configuration: values are strings or nested sections.
type vdf map[string]any

// section returns the section of a key, matched regardless of case as
// Steam does, or nil.
func (v vdf) section(key string) vdf {
	s, ok := v[key].(vdf)
	if !ok {
		for k, sub := range v {
			if strings.EqualFold(k, key) {
				s, _ = sub.(vdf)
			}
		}
	}
	return s
}

func (v vdf) str(key string) string {
	s, _ := v[key].(string)
	return s
}

// int returns the number of a key, 0 if it has none.
func (v vdf) int(key string) int64 {
	n, _ := strconv.ParseInt(v.str(key), 10, 64)
	return n
}

// parseVDF reads a KeyValues text file. Keys keep their case.
func parseVDF(data string) (vdf, error) {
	p := &vdfParser{s: data}
	root, err := p.section(false)
	return root, err
}

type vdfParser struct {
	s string
	i int
}

func (p *vdfParser) section(nested bool) (vdf, error) {
	v := vdf{}
	for {
		key, ok, err := p.token()
		if err != nil {
			return nil, err
		}
		if !ok {
			if nested {
				return nil, errors.New("vdf: unclosed section")
			}
			return v, nil
		}
		if key == "}" {
			if !nested {
				return nil, errors.New("vdf: unexpected }")
			}
			return v, nil
		}
		value, ok, err := p.token()
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, errors.New("vdf: missing value of " + key)
		}
		if value == "{" {
			sub, err := p.section(true)
			if err != nil {
				return nil, err
			}
			v[key] = sub
		} else {
			v[key] = value
		}
	}
}

// token returns the next string, "{" or "}", skipping space and comments.
func (p *vdfParser) token() (string, bool, error) {
	for p.i < len(p.s) {
		switch c := p.s[p.i]; {
		case c == ' ' || c == '\t' || c == '\r' || c == '\n':
			p.i++
		case strings.HasPrefix(p.s[p.i:], "//"):
			for p.i < len(p.s) && p.s[p.i] != '\n' {
				p.i++
			}
		case c == '{' || c == '}':
			p.i++
			return string(c), true, nil
		case c == '"':
			var b strings.Builder
			for p.i++; p.i < len(p.s); p.i++ {
				switch c := p.s[p.i]; c {
				case '\\':
					p.i++
					if p.i < len(p.s) {
						b.WriteByte(p.s[p.i])
					}
				case '"':
					p.i++
					return b.String(), true, nil
				default:
					b.WriteByte(c)
				}
			}
			return "", false, errors.New("vdf: unclosed string")
		default:
			// An unquoted token, such as a conditional like [$WIN32].
			start := p.i
			for p.i < len(p.s) && !strings.ContainsRune(" \t\r\n{}\"", rune(p.s[p.i])) {
				p.i++
			}
			return p.s[start:p.i], true, nil
		}
	}
	return "", false, nil
}

func readVDF(path string) (vdf, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return parseVDF(string(data))
}
