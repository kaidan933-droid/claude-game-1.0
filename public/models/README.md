# Car model

Put a GT3 RS model here as `gt3rs.glb` (glTF binary) and the game uses it instead of the built-in car.

- Draco-compressed files work.
- Wheels are found by mesh/node names containing `wheel`, `tire`, `tyre` or `rim`; body paint by material names
  containing `paint`, `body`, `carpaint` or `exterior`; tail/brake lights by `tail`, `brake` or `rear light`.
- If something is off (car backwards, wrong paint part, wheels not spinning), add `gt3rs.json` next to it:

```json
{
  "forward": 1,
  "rotateY": 0,
  "paintMaterial": "Carpaint",
  "wheelNames": ["wheel_FL", "wheel_FR", "wheel_RL", "wheel_RR"],
  "tailMaterial": "Taillight"
}
```

`forward` is 1 or -1 and flips which end is the front. Keep the model under about 150k triangles for phones,
and credit the author if the license asks for it.
