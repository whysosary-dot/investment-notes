# Claude 작업 지침 — investment-notes

이 저장소에서 작업할 때 따라야 할 규칙입니다.

## 사용자가 이미지를 업로드하며 "정리해줘/추가해줘/푸시해줘"라고 하면

1. **이미지를 읽어 기업명을 식별**하고, 한국어 종목명과 종목코드(있다면)를 확인.
   - 종목명이 모호하면 사용자에게 한 번 확인.
2. **company id**는 영문 소문자 + 하이픈 (예: `samsung-electronics`, `sk-hynix`, `naver`).
3. **이미지 파일을 보존**:
   - 업로드된 이미지를 `~/Desktop/Claude/investment-notes/images/<company-id>/<YYYY-MM-DD-slug>.<ext>` 로 복사.
   - 파일명 슬러그는 카드 제목에서 만들어 짧게.
4. **`data/companies.json` 편집**:
   - 기존 기업이면 해당 entry의 `cards` 배열 맨 뒤에 카드 push.
   - 새 기업이면 `companies` 배열에 새 entry 추가.
   - 카드는 다음 형태:
     ```json
     {
       "id": "card-NNN",       // 회사 내 zero-padded sequence
       "title": "<자료 핵심을 한 줄로>",
       "date": "YYYY-MM-DD",   // 자료 날짜 (모르면 오늘)
       "source_image": "images/<company-id>/<file>",
       "summary": ["...", "...", "..."],  // 3-5개
       "tags": ["..."]
     }
     ```
   - `last_updated`를 오늘 날짜로 갱신.
5. **요약 작성 규칙**:
   - 한국어 불릿 3-5개.
   - 각 불릿은 **한 줄, 명사 종결** 또는 짧은 평서문.
   - 숫자·날짜·고유명사는 이미지에 적힌 그대로 보존.
   - 사견·해석은 넣지 않음 (이미지 내용 요약에 충실).
6. **커밋 & 푸시**:
   ```bash
   cd ~/Desktop/Claude/investment-notes
   git add -A
   git commit -m "Add card: <company> — <title>"
   git push
   ```
7. 푸시 성공 후, 사용자에게 GitHub Pages URL과 새 카드의 위치를 알려줌.

## 새 기업 entry 템플릿

```json
{
  "id": "<slug>",
  "name": "<한국어 종목명>",
  "ticker": "<종목코드 또는 빈 문자열>",
  "sector": "<섹터, 모르면 빈 문자열>",
  "tags": [],
  "created_at": "YYYY-MM-DD",
  "cards": []
}
```

## 금지

- 임의로 카드 삭제 금지 (사용자가 명시적으로 요청할 때만).
- 사용자 동의 없이 `git push --force` 금지.
- 이미지 원본 파일 변형 금지 (resize/crop은 사용자가 요청할 때만).
