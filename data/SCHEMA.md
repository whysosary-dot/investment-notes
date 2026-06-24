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

## 카드 선택 필드

- `chart` (단일) 또는 `charts` (배열): 차트 시각화. type=`bar`/`bar-h`/`donut`/`line`.
- `images`: 첨부 이미지 경로 배열 (예: `["images/inbody/card-004-...jpg"]`). 단일 `source_image`도 계속 지원.
- `added_at`: 카드 추가 시점(작업일). 초록불/“미푸시” 판단 기준.

## 웹 에디터 (assets/admin.js)

사이트에서 직접 카드/기업을 추가·수정·삭제할 수 있다.

- 우하단 ＋카드 / ↑푸시 / ⚙설정 버튼. 카드별 수정·삭제, 기업 수정·삭제 지원.
- 변경은 브라우저 localStorage(`inv_pending_ops_v1`)에 op 단위로 쌓이고 “미푸시” 배지로 표시.
- ⚙에서 GitHub Fine-grained PAT(Contents read/write) 입력 — 토큰은 그 기기 브라우저에만 저장, repo 미커밋.
- ↑푸시 시 GitHub Contents API로 첨부 이미지(클라이언트에서 가로 1400px·JPEG 압축)를 먼저 업로드한 뒤 `data/companies.json`을 커밋 → 다른 기기에도 반영.
