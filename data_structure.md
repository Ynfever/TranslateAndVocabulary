Vocabulary List
A **Vocabulary** may contain the following properties.
    - Word:
    str: The vocabulary term.
    - Definition: 
    str: The meaning of the word in Chinese.
    - Equivalents Words: 
    list of objects and string pairs: **Vocabularies** with similar meanings and their definitions.
    - Confusable Words: 
    list of objects and string pairs: **Vocabularies** that are often confused with each other and their definitions.
    - Example Sentence: 
    list of objects: **Sentences** that uses the word.
    - Example Question: 
    list of objects: **MCQs** that uses the word in context.

e.g.
{
    "itemID": 1,
    "Word": "relic",
    "Definition": "遗物, 遗迹",
    "Equivalents Words": [{"vocabulary": **vestige**'s itemID, "defination": "更偏向“痕迹”，可用于抽象概念"}, {"vocabulary": **artifact**, "defination": "特指人工制品"}],
    "Confusable Words": [{"word": **relict**, "definition": "残遗的生物或地貌"}, {"word": **relish**, "definition": "享受"}],
    "Example Sentence": [],
    "Example Question": []
}

Sentence List:
A **Sentence** may contain the following properties:
    - sentence:
    str: The example sentence text.
    - translation:
    str: The translated sentence text.
    - key_words:
    list of object and string pairs: **Vocabularies** that are selected from the context of the example sentence and their corresponding definitions.

MCQ List:
A **MCQ** may contain the following properties:
    - question:
    str: The question text.
    - options:
    list of object and string pairs: **Vocabularies** that are the possible answers to the question and their corresponding definitions.
    - correct_answers:
    list of strings: The correct answers to the question.