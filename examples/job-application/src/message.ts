import { Schema as S } from 'effect'
import { messages } from 'foldkit/message'

import { Menu, Tabs } from '@foldkit/ui'

import { Step } from './domain'
import {
  Attachments,
  CoverLetter,
  Education,
  PersonalInfo,
  Skills,
  WorkHistory,
} from './step'

// STEP SUBMODELS

// NAVIGATION

// PREVIEW

// SUBMISSION

// UNION

export const Message = messages({
  GotPersonalInfoMessage: {
    message: PersonalInfo.Message,
  },
  GotWorkHistoryMessage: {
    message: WorkHistory.Message,
  },
  GotEducationMessage: {
    message: Education.Message,
  },
  GotSkillsMessage: {
    message: Skills.Message,
  },
  GotCoverLetterMessage: {
    message: CoverLetter.Message,
  },
  GotAttachmentsMessage: {
    message: Attachments.Message,
  },
  GotStepMenuMessage: {
    message: Menu.Message,
  },
  GotStepTabsMessage: {
    message: Tabs.Message,
  },
  NavigatedToStep: { step: Step.Step },
  ClickedNext: {},
  ClickedPrevious: {},
  ToggledPreview: {},
  ClickedSubmit: {},
  SucceededSubmitApplication: {},
  FailedSubmitApplication: {
    error: S.String,
  },
})

export const {
  GotPersonalInfoMessage,
  GotWorkHistoryMessage,
  GotEducationMessage,
  GotSkillsMessage,
  GotCoverLetterMessage,
  GotAttachmentsMessage,
  GotStepMenuMessage,
  GotStepTabsMessage,
  NavigatedToStep,
  ClickedNext,
  ClickedPrevious,
  ToggledPreview,
  ClickedSubmit,
  SucceededSubmitApplication,
  FailedSubmitApplication,
} = Message

export type Message = typeof Message.Type
