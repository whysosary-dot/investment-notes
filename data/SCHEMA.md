# Data Schema

`data/companies.json` 구조:

```json
{
  "schema_version": "1.0",
  "last_updated": "YYYY-MM-DD",
  "companies": [
    {
      "id": "samsung-electronics",
      "name": "삼성전자",
      "ticker": "005930",
      "sector": "반도체",
      "tags": ["메모리", "파운드리"],
      "created_at": "YYYY-MM-DD",
      "cards": [
        {
          "id": "card-001",
          "title": "2026 1Q 실적 발표 요약",
          "date": "YYYY-MM-DD",
          "source_image": "images/samsung-electronics/2026q1.png",
          "summary": [
            "핵심 포인트 1",
            "핵심 포인트 2",
            "핵심 포인트 3"
          ],
          "tags": ["실적", "1Q26"]
        }
      ]
    }
  ]
}
```

## 카드 추가 규칙

- `id`는 `card-001`처럼 zero-padded sequence
- `summary`는 3-5개 불릿
- 이미지는 `images/{company-id}/` 아래로 저장
- 사용자가 이미지 업로드 → Claude가 분석 → 이 JSON을 직접 편집 → git commit & push
