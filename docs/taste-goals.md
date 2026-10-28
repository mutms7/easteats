# What matters most right now?

The questionnaire has five single-choice priorities:

| Choice | Description | Ranking effect |
| --- | --- | --- |
| Hidden gems | Food first. Fancy is optional. | Gives food and personal taste more influence, with less influence from service and atmosphere. |
| Great value | A good meal for what you spend. | Gives review-derived value more influence, rather than treating cheap prices as proof of value. |
| Date night | Good food and a place to linger. | Gives atmosphere and service more influence alongside food. |
| Great service | A friendly welcome and an easy meal. | Gives service more influence alongside food. |
| A bit of everything | Food, value, and the whole experience. | Gives food, taste, value, distance, service, and atmosphere a say. |

Pick a priority during onboarding or return to **Taste** to change it later. The choice is saved with favorites and corrections. Selecting a card doesn't call an API. Saving preferences uses the existing taste-interpretation request.

## How it affects the results

The optional `goal` field accepts `hidden-gems`, `date-night`, `service`, `value`, or `balanced`. The saved questionnaire JSON already supports the field, so no database migration is needed. Existing profiles and API callers without a goal keep their previous behavior.

Claude receives the selected goal as context, while extracting preferences from the favorite reasons and notes. The server blends those validated weights equally with the selected priority's baseline. Cuisine, dish, flavor, spice, and fusion preferences remain intact. The normal runtime ranking uses the resulting weights.

The explicit priority is applied and saved before the Claude request. If the provider is unavailable or its app spending limit is reached, the priority still works using baseline weights, with prior food tags retained. The UI explains that learning from favorites is unfinished. Retrying doesn't repeatedly compound the priority weights, and unknown provider spending stays reserved.

Hidden gems is a food-first preference, not a claim that a listing is undiscovered or that low ratings prove good food. Google stars don't receive a ranking bonus. Cleanliness concerns remain separate and visible.

## Persistence and checks

Each account has its own local goal draft. Invalid drafts fall back to the saved account choice, then to **A bit of everything**. The existing favorites draft format is unchanged. Signing out resets the current selection in memory.

Tests cover restaurant-order changes for different priorities, unchanged legacy behavior, validation, provider failure and spending limits, reloads, correction saves, later edits, and account isolation. Browser screenshots check the five cards on a phone.
