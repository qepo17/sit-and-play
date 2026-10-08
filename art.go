package main

import (
	"context"
	"fmt"
	"hash/fnv"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"math"
	"net/http"
)

// artFor returns the generated art of a game: the colors of its picture
// when there is one, colors picked by its ID otherwise. The shapes are
// placed by its ID, so they stay where they are when the colors change.
func artFor(id string, img image.Image) Art {
	h := fnv.New32a()
	h.Write([]byte(id))
	n := h.Sum32()
	a := Art{
		Cx:  float64(40 + n%30),
		Cy:  float64(40 + (n/30)%30),
		Rot: float64(int((n/900)%30) - 15),
	}
	hue, sat := float64((n/27000)%360), 0.5
	second := math.Mod(hue+150, 360)
	if img != nil {
		hue, second, sat = paletteHues(img, hue)
	}
	a.Bg = hsl(hue, 0.45*sat, 0.12)
	a.A1 = hsl(hue, 0.6*sat+0.1, 0.45)
	a.A2 = hsl(second, 0.85, 0.62)
	return a
}

// paletteHues returns the most common hue of an image, an accent hue far
// from it, and how colorful the image is, from 0 to 1. fallback is the
// hue of an image without colors.
func paletteHues(img image.Image, fallback float64) (main, accent, sat float64) {
	const bins = 12
	var weight [bins]float64
	var sumX, sumY [bins]float64
	var total, colorful float64
	b := img.Bounds()
	step := max(1, b.Dx()/120)
	for y := b.Min.Y; y < b.Max.Y; y += step {
		for x := b.Min.X; x < b.Max.X; x += step {
			r, g, bl, _ := img.At(x, y).RGBA()
			h, s, l := toHSL(float64(r)/0xffff, float64(g)/0xffff, float64(bl)/0xffff)
			total++
			if s < 0.25 || l < 0.12 || l > 0.9 {
				continue
			}
			colorful++
			i := int(h/(360/bins)) % bins
			weight[i] += s
			// Hues average as angles, so 350° and 10° make 0°.
			sumX[i] += s * math.Cos(h*math.Pi/180)
			sumY[i] += s * math.Sin(h*math.Pi/180)
		}
	}
	if total == 0 || colorful/total < 0.03 {
		return fallback, math.Mod(fallback+150, 360), 0.3
	}
	meanHue := func(i int) float64 {
		return math.Mod(math.Atan2(sumY[i], sumX[i])*180/math.Pi+360, 360)
	}
	first := 0
	for i := range bins {
		if weight[i] > weight[first] {
			first = i
		}
	}
	main = meanHue(first)
	second := -1
	for i := range bins {
		d := min((i-first+bins)%bins, (first-i+bins)%bins)
		if d >= 3 && weight[i] > weight[first]*0.08 && (second < 0 || weight[i] > weight[second]) {
			second = i
		}
	}
	accent = math.Mod(main+150, 360)
	if second >= 0 {
		accent = meanHue(second)
	}
	return main, accent, min(1, 0.4+colorful/total)
}

func toHSL(r, g, b float64) (h, s, l float64) {
	hi, lo := max(r, g, b), min(r, g, b)
	l = (hi + lo) / 2
	if hi == lo {
		return 0, 0, l
	}
	d := hi - lo
	s = d / (1 - math.Abs(2*l-1))
	switch hi {
	case r:
		h = math.Mod((g-b)/d+6, 6)
	case g:
		h = (b-r)/d + 2
	default:
		h = (r-g)/d + 4
	}
	return h * 60, s, l
}

// hsl returns a color as "#rrggbb".
func hsl(h, s, l float64) string {
	c := (1 - math.Abs(2*l-1)) * s
	x := c * (1 - math.Abs(math.Mod(h/60, 2)-1))
	var r, g, b float64
	switch {
	case h < 60:
		r, g = c, x
	case h < 120:
		r, g = x, c
	case h < 180:
		g, b = c, x
	case h < 240:
		g, b = x, c
	case h < 300:
		r, b = x, c
	default:
		r, b = c, x
	}
	m := l - c/2
	ch := func(v float64) int { return int(math.Round((v + m) * 255)) }
	return fmt.Sprintf("#%02X%02X%02X", ch(r), ch(g), ch(b))
}

// image downloads and decodes a picture.
func (s *steamAPI) image(ctx context.Context, url string) (image.Image, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	res, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, statusError{res.StatusCode}
	}
	img, _, err := image.Decode(res.Body)
	return img, err
}
