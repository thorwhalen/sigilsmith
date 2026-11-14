---
title: "Identity, images and memory: background research for sigilsmith"
author: Thor Whalen
date: 2026-11-14
---

# Identity, images and memory: background research for sigilsmith

## Summary

- **Images beat words for recognition memory (established).** The picture superiority effect is robust since the 1960s and 1970s [1][2][3][4]. Caveat: those studies used meaningful, nameable pictures, not abstract glyphs.
- **For identifying one item among many on screen, color and shape are efficient search channels (established), but only a handful of categories at a time.** Feature search is fast for a single distinct hue or shape [5][6]. Capacity limits show up quickly as the number of colors grows [7].
- **No direct evidence supports "abstract symbols accrue more moss than descriptive ones".** I found no study that tests it. The nearest findings mostly point the other way or are neutral: meaningless labels are harder to learn than meaningful ones [8], arbitrary images get remembered better once given a meaning [9][10], and concreteness matters less than familiarity once users have experience [11][12].
- **What does support the hypothesis, indirectly:** the Baker/baker-style finding that a meaningful cue is easier to retrieve than an arbitrary one cuts against it, but an abstract image that has no pre-existing meaning also has no competing associations, and the fan effect shows that extra facts slow retrieval of a concept [13]. These two sit in tension; the net effect for an image is untested (speculation).
- **Stability of the mapping is the best-supported design lever.** Familiarity with the image-meaning pairing is what drives performance over time [12]. If the image changes, accrued associations are lost (inference from [12], marked as such below).
- **A visual identifier is distinguishable when it differs in a few large, categorical features.** Graphical fingerprints are compared fast (median 2.0 s vs 8.0 s for hexadecimal) but errors rise when attackers or near-duplicates differ only in details [14]. Humans reliably distinguish roughly 30 bits from visual hashes, per a secondary report [15].
- **Label plus image together is at least as good as either alone and better than the image alone** in the one icon-versus-label learning study I could verify [16].
- **Several citations could be verified only at the title and abstract level, or not at all.** Section "What could not be verified" lists them.

## How this report was built

Bibliographic details were checked against Crossref (title, first author, venue, year) for every DOI cited. Findings come from abstracts and, for [14] and the drunken bishop paper [17], from the full text. Where I only had an abstract or a secondary description, the text says so. Claims marked **Speculation** are my own inferences, not findings.

## Q1. Is identity recognized faster or better from images than from text labels?

### Recognition memory: the picture superiority effect (established)

Shepard (1967) found that recognition memory for pictures exceeded recognition for words and sentences [1]. Standing (1973) extended this to very large picture sets (the title reports 10,000 pictures) with high recognition performance [2]. Paivio and Csapo (1973) asked whether the advantage comes from imagery or from dual coding, and their paper is the origin of the dual-coding account: a picture is stored as an image and tends to be named as well, giving two retrieval routes [3]. Nelson, Reed and Walling (1976) is a standard demonstration under controlled conditions [4]. Stenberg (2006) argues that both conceptual and perceptual factors contribute, which matters here because a generated identicon has strong perceptual distinctiveness but weak conceptual content [18]. I did not retrieve the full text of [18], so the exact split is not verified.

Brady et al. (2008) showed that visual long-term memory retains object details, not just gist [19]. I verified only the title and venue.

Two limits. First, the classic effect is shown with recognition, and the picture advantage in free recall is smaller and depends on stimuli and procedure (the very question [3] addresses). Second, the stimuli were photos and line drawings of nameable objects. These findings do not establish the same advantage for arbitrary generated patterns.

### Recognition versus recall (established, with a design caveat)

Dhamija and Perrig (2000) built an authentication scheme on recognition of images rather than recall of strings. In a 20-participant study, 90% succeeded with the image scheme versus about 70% with passwords and PINs [20]. This is small-sample evidence that recognition of images works for identity-like tasks. A list of items in an app is a recognition task: the user sees the item and needs to know which one it is.

### Icons versus text labels in HCI (mixed)

The one study I could partly verify is Wiedenbeck (1999), where novices used an email program with buttons that were text labels, icons, or icon plus label. Per the abstract and a secondary summary, first-session performance was best with labels and with icon-plus-label, and icons alone were worse; I could not retrieve the delayed-session results [16]. This does not support "image alone beats words for identity". It supports pairing the two.

Byrne (1993) found that simple icons were found faster in search than complex ones; I could only confirm this through secondary descriptions, not the abstract [21].

### Visual search: color and shape (established)

Treisman and Gelade (1980) established that a target defined by a single feature such as color or orientation can be found without a serial scan, while conjunctions need attention [5]. Wolfe and Horowitz (2004) list the attributes that guide attention (color, motion, orientation and size are undoubted; shape-like features are less certain) [6]. Haroz and Whitney (2012) studied how capacity limits of attention affect visualization effectiveness; color and category count interact strongly [7]. I did not retrieve their numeric limits. A 2021 outlier-detection paper is reported to put the color capacity limit in conjunction search below four colors, but I did not verify that primary figure.

Read together, these say: in a list of many items, a single item that differs in hue or shape pops out, but a list where every item has its own hue and shape is not a pop-out display. It is a recognition display, where each item must be matched to memory. This is a design-relevant inference, not a finding from one paper.

### Object files and visual indexing (theory)

Kahneman, Treisman and Gibbs (1992) proposed object files: temporary records that hold the properties of one object and are updated across time and position [22]. Pylyshyn (2001) proposed visual indexes that point at objects before their features are encoded [23]. Both are accounts of how a perceptual system tracks "this particular thing" as an individual. They support the idea that identity is bound to a perceptual token, but they concern seconds-long tracking, not long-term memory. **Speculation:** a stable image per item gives the mind a token to bind an object file to, and the author's "moss" maps loosely onto what gets bound to it. I found no study testing that mapping.

## Q2. Do abstract or arbitrary symbols accumulate associations more or less easily than descriptive labels?

### Direct evidence

None found. I searched for studies comparing association accretion over time across abstract versus descriptive identifiers, in memory, HCI and brand research, and found none. The hypothesis in the brief is untested as stated. What follows is the nearest evidence.

### Evidence that cuts against the hypothesis

1. **Meaningless labels are harder to attach information to.** Cohen (1990) tested why names are hard to put to faces. Name recall was no better than recall of meaningless non-word possessions and worse than recall of meaningful occupations or possessions. When names were made meaningful and occupations meaningless, the name deficit disappeared [8]. The common name for this is the Baker/baker paradox (the same word is easier to learn as an occupation than as a surname). I could not retrieve the source abstract of McWeeny et al. (1987), which is usually cited for it, so the paradox is cited here to [24] with only the title and a secondary description verified. Implication: an arbitrary label is a weak anchor for new information, because nothing already in memory connects to it.
2. **Meaning added to arbitrary pictures improves their memory.** Bower, Karlin and Dueck (1975) showed that nonsense pictures (droodles) were recalled much better when study included a verbal interpretation [9]. Klatzky and Rafnel (1976), as described secondarily, questioned whether the benefit is better interpretation or just an extra retrieval cue [9 notes]. Either way, a label on an abstract image helps.
3. **Meaning speeds perception of novel shapes.** Lupyan and Spivey (2008) report that novel stimuli treated as members of a known category (for instance, as digits) were searched more efficiently [10]. Per the abstract-level source only.
4. **Elaborative or deeper processing improves retention.** Craik and Lockhart (1972) and Craik and Tulving (1975) show that meaning-oriented processing yields better memory than shallow processing [25][26]. An abstract image gives little to elaborate on, unless the user supplies the elaboration.
5. **In icon research, concreteness helps early and fades.** McDougall, Curry and de Bruijn (2000) found concreteness mattered mainly for how quickly people first grasped an icon's meaning, while complexity effects persisted longer and related to search efficiency [11]. Isherwood, McDougall and Curry (2007) found that icon characteristics explained up to 69% of performance variance, that semantic distance mattered first while the icon-function link was learned, and that familiarity mattered later; they concluded that concreteness may not be of primary importance [12]. The 1999 norming paper supplies concreteness, complexity, meaningfulness, familiarity and semantic distance ratings for 239 symbols [27].

### Evidence that supports it, or leaves room for it

1. **Fan effect.** Anderson (1974) found that the more facts are learned about a concept, the slower any one of them is retrieved [13]. This is a cost of moss on any concept, but it applies to any identifier, abstract or not.
2. **Distinctiveness.** The von Restorff effect, discussed by Hunt (1995), is better memory for items that stand out from their context, with Hunt arguing the effect is subtler than the textbook version [28]. I verified only the paper's title and venue. An identifier with no prior associations is distinctive by construction among the user's existing concepts. **Speculation:** this could give abstract marks a clean slate for associations, since no prior meaning competes. Spreading-activation theory (Collins and Loftus 1975) says activation moves along existing links between concepts, so a node with few prior links has few competing paths [29]. I found no study that tests this for visual identifiers.
3. **Brand-mark research is suggestive but unverified here.** Henderson and Cote (1998) and Janiszewski and Meyvis (2001) study logo design, including complexity and repetition effects on processing fluency [30][31]. I verified only titles and venues, not their findings on abstract versus descriptive marks, so I draw nothing from them. Childers and Houston (1984) studied conditions for picture superiority in consumer memory [32]; same caveat.

### Bottom line for the hypothesis

Established: meaning helps memory; arbitrary labels are poor anchors [8]; labeling an abstract image improves memory for it [9]. Not established: that an abstract image accretes more associations than a descriptive one. **Speculation, flagged:** the plausible mechanism is "no competition from prior meaning", with the plausible counter-mechanism being "no initial hook". The data above suggest the hook matters at first and familiarity takes over with repeated exposure [12]. Under that reading, the best strategy for a long-lived list is a stable abstract image that quickly becomes familiar, plus a visible label while the pairing is being learned.

## Q3. What makes a visual identifier distinguishable?

### Hash visualization and random art

Perrig and Song (1999) proposed hash visualization: replacing a hard-to-compare string with a structured image generated from the hash, with Random Art as the prototype, for tasks like checking a root key [33]. OpenSSH's randomart (drunken bishop) is a heuristic variant: a walk on a 9 by 17 grid driven by 2-bit groups of the fingerprint [17]. The analysis authors state that the algorithm was designed heuristically, that they could produce only basic results on collisions, and that whether it is secure enough remains open [17].

### Empirical comparisons

- **Dechand et al. (2016)**, 1,047 participants, six textual representations: hexadecimal was more vulnerable to partial-preimage attacks than the alternatives, and sentence-based encoding scored best on attack detection and usability [34]. That is about text, but it is the same pairwise-comparison task.
- **Tan et al. (CHI 2017)**, 661 participants, eight representations: attack success ranged from 6% to 72% across configurations. Graphical representations (including Vash, a Random Art implementation, and generated unicorns) were generally faster to compare (median 2.0 s for unicorns vs 8.0 s for hexadecimal) but varied in security; participants looked at the big picture and could miss small differences, as the authors found with unicorns. They suggest visual representations when usability matters more than security. The authors also note that fingerprints based on abstract art are hard to commit to memory, which showed as more toggling when the two images were not shown side by side (median 5.2 s vs 2.2 s) [14]. This last point is the authors' own explanation, not a tested mechanism, and it is the nearest thing I found to evidence about memorability of abstract marks. It is weak support for the opposite of the brief's hypothesis, for a task that is about verbatim match and not association.
- **Hsiao et al. (2009)**, over 400 participants: Random Art and two flag-style visual hashes were among the top performers on accuracy and response time, per a secondary summary [35].
- **Olembo et al. (2014)**, SCoP visual hash encoding 60 bits through shapes, colors, patterns and positions: 97% accuracy for a stacked side-by-side comparison, with the authors noting the same-size, same-time display is unrealistic [36]. Earlier visual hashes were reported to let people distinguish only about 30 bits [36][15].
- **Déjà Vu** shows people reliably recognize random-art-like images as familiar after one viewing [20].
- **Identicon-specific studies:** I found no peer-reviewed study that measures how well people tell GitHub-style or Gravatar-style identicons apart. Everything above is for cryptographic fingerprints, which is a harder task (exact match) than telling list items apart.

### Feature-level reasoning (partly inferred)

- **Symmetry.** Barlow and Reeves (1979) studied detecting mirror symmetry in random-dot displays, and the title reports high efficiency [37]. This is why mirrored grids look like coherent objects. I did not verify the numeric results. **Speculation:** a symmetric glyph is perceived as one object, which helps tracking and recognition at small sizes, but symmetry halves the usable information.
- **Complexity.** Alvarez and Cavanagh (2004) found visual short-term memory capacity falls as object complexity (measured by visual search efficiency) rises, down to about 1.5 items for the most complex objects [38]. Byrne (1993) is cited secondarily for simple icons being faster to find [21]. Together these say a small number of simple features beats many fine features.
- **Color count.** More colors in a display make categorical judgments harder [7]. I could not verify a specific safe number, so the design implications below do not give one.
- **Size limits.** I found no verified study giving a minimum size in pixels for distinguishing generated identifiers. The brief's `sizeRange` manifest field should be measured by the project's own harness, not taken from literature.

## Design implications for sigilsmith

Each item names its basis. Items resting on inference are marked.

1. **Make hue and a coarse shape or layout the primary distinguishing channels.** Single features guide search [5][6], and graphical fingerprints are compared fastest (2.0 s vs 8.0 s) [14]. Basis: established.
2. **Keep few, large features at small sizes.** Complexity lowers capacity and search efficiency [38][11][21]. At 16 to 32 px, use a small number of colors and big blocks, not fine detail. No verified pixel or color-count threshold exists [7]; measure with the harness in the brief's B14 and record the result in each manifest's `sizeRange`.
3. **Use mirror symmetry as an option, with the trade-off declared.** Mirror symmetry is detected efficiently [37], and coherent single-object perception is plausible; but it halves the information. Basis: [37] plus speculation on tracking. Declare `symmetry` in the manifest.
4. **Treat near-collisions as the real distinguishability risk, not exact collisions.** In [14], attackers who matched the "big picture" of a fingerprint fooled viewers; the same applies to two unrelated items whose images differ only in fine details. Add a near-duplicate metric (perceptual distance at 32 px) to the evaluation harness and flag generators whose images for different keys fall below a threshold. Basis: [14][17].
5. **Offer label plus image as the default list-item rendering.** Icon plus label matched labels alone and beat icons alone in learning [16], and meaning added to an abstract image helps memory for it [9][10]. This agrees with dual coding [3]. Basis: established for the icon and labelled-droodle cases; extension to identicons is inference.
6. **Never change the mapping silently.** Familiarity with the image-meaning pairing is what matters once users have experience [12], so an image that changes loses the learned pairing. This supports the brief's B3 determinism rules and its B19 default of `ask` or `never` over `always` on renames. Basis: [12] plus inference that familiarity transfers only if the image is the same.
7. **Prefer abstract or geometric generators for long-lived lists, and add the label while the user is learning.** Abstract marks have weak initial hooks [8][11][12] but may carry little competing meaning (speculation, see Q2). Hedge by showing the name beside the image until the user has had repeated exposure. Offer a `concrete` option (initials, icons) for first-time or low-frequency use, where semantic distance dominates [12].
8. **Give users a way to attach meaning.** Because a label or interpretation raises memory for abstract images [9], expose an optional user-editable caption or nickname on the item card rather than only the generated image. Basis: [9][10].
9. **Use color as one channel among several, not the only one.** Color capacity limits appear as category counts rise [7], and graphical fingerprint viewers noticed small color shifts across media [14]. Pair hue with shape or layout, and check light and dark themes and color-vision deficiencies in the harness.
10. **Keep the same size and display condition when comparing candidates.** Visual-hash studies that show pairs side by side at one size overstate real performance [36]; in [14], toggling between views made abstract art comparisons slower. Evaluate generators in the sizes and contexts the app actually uses (list, header, favicon).
11. **Do not claim that abstract marks accrue more association "moss".** The documentation should state the hypothesis as untested and cite this report. Frame the product benefit as distinctiveness, stability and speed of recognition, which are supported.
12. **Optional experiment for the project (speculation, not a finding).** The hypothesis is testable cheaply: a within-subject study with items shown as abstract identicon, concrete icon, or name only, measuring how fast facts about each item are learned and recalled a day later. If sigilsmith wants to cite evidence, this study would need to be run.

## What could not be verified

- Abstract versus descriptive logo research [30][31][32]: titles and venues verified, findings not retrieved.
- McWeeny et al. (1987) [24]: citation verified; abstract not retrieved. The term "Baker/baker paradox" did not appear in any search result I saw; its attribution here is from my memory of the literature.
- Byrne (1993) [21] and Wiedenbeck (1999) [16]: findings drawn from abstracts or secondary summaries; the delayed-session results of [16] not seen.
- Standing, Shepard and Nelson et al.: citations verified, specific effect sizes not re-read here and not quoted.
- Brady et al. [19], Stenberg [18], Barlow and Reeves [37], Hunt [28]: citations verified; findings described only at the level of the title.
- Hsiao et al. [35] and the 30-bit figure [15][36]: secondary reports of the studies.
- Color capacity numbers for [7]: not retrieved. The statement about a "below four colors" limit in conjunction search comes from a 2021 arXiv paper (not cited in the list) that I saw only in a snippet.
- Any peer-reviewed study of identicon distinguishability, and any minimum pixel size for distinguishing generated identifiers: none found.

## REFERENCES

1. [Shepard RN. Recognition memory for words, sentences, and pictures. J Verbal Learn Verbal Behav. 1967;6(1):156-163.](https://doi.org/10.1016/S0022-5371(67)80067-7)
2. [Standing L. Learning 10000 pictures. Q J Exp Psychol. 1973;25(2):207-222.](https://doi.org/10.1080/14640747308400340)
3. [Paivio A, Csapo K. Picture superiority in free recall: imagery or dual coding? Cogn Psychol. 1973;5(2):176-206.](https://doi.org/10.1016/0010-0285(73)90032-7)
4. [Nelson DL, Reed VS, Walling JR. Pictorial superiority effect. J Exp Psychol Hum Learn Mem. 1976;2(5):523-528.](https://doi.org/10.1037/0278-7393.2.5.523)
5. [Treisman AM, Gelade G. A feature-integration theory of attention. Cogn Psychol. 1980;12(1):97-136.](https://doi.org/10.1016/0010-0285(80)90005-5)
6. [Wolfe JM, Horowitz TS. What attributes guide the deployment of visual attention and how do they do it? Nat Rev Neurosci. 2004;5:495-501.](https://doi.org/10.1038/nrn1411)
7. [Haroz S, Whitney D. How capacity limits of attention influence information visualization effectiveness. IEEE Trans Vis Comput Graph. 2012 (InfoVis).](https://whitneylab.berkeley.edu/PDFs/Haroz_Whitney_2012_InfoVis.pdf)
8. [Cohen G. Why is it difficult to put names to faces? Br J Psychol. 1990;81(3):287-297.](https://doi.org/10.1111/j.2044-8295.1990.tb02362.x)
9. [Bower GH, Karlin MB, Dueck A. Comprehension and memory for pictures. Mem Cognit. 1975;3(2):216-220.](https://doi.org/10.3758/bf03212900)
10. [Lupyan G, Spivey MJ. Perceptual processing is facilitated by ascribing meaning to novel stimuli. Curr Biol. 2008;18(10):R410-R412.](https://doi.org/10.1016/j.cub.2008.02.073)
11. [McDougall SJP, Curry MB, de Bruijn O. Exploring the effects of icon characteristics on user performance: the role of icon concreteness, complexity, and distinctiveness. J Exp Psychol Appl. 2000;6(4):291-306.](https://doi.org/10.1037/1076-898X.6.4.291)
12. [Isherwood SJ, McDougall SJP, Curry MB. Icon identification in context: the changing role of icon characteristics with user experience. Hum Factors. 2007;49(3):465-476.](https://doi.org/10.1518/001872007X200102)
13. [Anderson JR. Retrieval of propositional information from long-term memory. Cogn Psychol. 1974;6(4):451-474.](https://doi.org/10.1016/0010-0285(74)90021-8)
14. [Tan J, Bauer L, Bonneau J, Cranor LF, Thomas J, Ur B. Can unicorns help users compare crypto key fingerprints? Proc CHI 2017:3787-3798.](https://doi.org/10.1145/3025453.3025733)
15. [Athene Center. Developing and testing a visual hash scheme (publication listing, secondary report of the roughly 30-bit figure).](https://www.athene-center.de/forschung/publikationen/developing-and-testing-a-visual-hash-scheme-1818)
16. [Wiedenbeck S. The use of icons and labels in an end user application program: an empirical study of learning and retention. Behav Inf Technol. 1999;18(2):68-82.](https://doi.org/10.1080/014492999119129)
17. [Loss D, Limmer T, von Gernler A. The drunken bishop: an analysis of the OpenSSH fingerprint visualization algorithm. 2009.](https://www.dirk-loss.de/sshvis/drunken_bishop.pdf)
18. [Stenberg G. Conceptual and perceptual factors in the picture superiority effect. Eur J Cogn Psychol. 2006;18(6):813-847.](https://doi.org/10.1080/09541440500412361)
19. [Brady TF, Konkle T, Alvarez GA, Oliva A. Visual long-term memory has a massive storage capacity for object details. Proc Natl Acad Sci USA. 2008;105(38):14325-14329.](https://doi.org/10.1073/pnas.0803390105)
20. [Dhamija R, Perrig A. Deja Vu: a user study using images for authentication. Proc 9th USENIX Security Symposium. 2000.](https://www.usenix.org/conference/9th-usenix-security-symposium/deja-vu-user-study-using-images-authentication)
21. [Byrne MD. Using icons to find documents: simplicity is critical. Proc CHI 1993:446-453.](https://doi.org/10.1145/169059.169369)
22. [Kahneman D, Treisman A, Gibbs BJ. The reviewing of object files: object-specific integration of information. Cogn Psychol. 1992;24(2):175-219.](https://doi.org/10.1016/0010-0285(92)90007-O)
23. [Pylyshyn ZW. Visual indexes, preconceptual objects, and situated vision. Cognition. 2001;80(1-2):127-158.](https://doi.org/10.1016/S0010-0277(00)00156-6)
24. [McWeeny KH, Young AW, Hay DC, Ellis AW. Putting names to faces. Br J Psychol. 1987;78(2):143-149.](https://doi.org/10.1111/j.2044-8295.1987.tb02235.x)
25. [Craik FIM, Lockhart RS. Levels of processing: a framework for memory research. J Verbal Learn Verbal Behav. 1972;11(6):671-684.](https://doi.org/10.1016/S0022-5371(72)80001-X)
26. [Craik FIM, Tulving E. Depth of processing and the retention of words in episodic memory. J Exp Psychol Gen. 1975;104(3):268-294.](https://doi.org/10.1037/0096-3445.104.3.268)
27. [McDougall SJP, Curry MB, de Bruijn O. Measuring symbol and icon characteristics: norms for concreteness, complexity, meaningfulness, familiarity, and semantic distance for 239 symbols. Behav Res Methods Instrum Comput. 1999;31(3):487-519.](https://doi.org/10.3758/BF03200730)
28. [Hunt RR. The subtlety of distinctiveness: what von Restorff really did. Psychon Bull Rev. 1995;2(1):105-112.](https://doi.org/10.3758/BF03214414)
29. [Collins AM, Loftus EF. A spreading-activation theory of semantic processing. Psychol Rev. 1975;82(6):407-428.](https://doi.org/10.1037/0033-295X.82.6.407)
30. [Henderson PW, Cote JA. Guidelines for selecting or modifying logos. J Mark. 1998;62(2):14-30.](https://doi.org/10.1177/002224299806200202)
31. [Janiszewski C, Meyvis T. Effects of brand logo complexity, repetition, and spacing on processing fluency and judgment. J Consum Res. 2001;28(1):18-32.](https://doi.org/10.1086/321945)
32. [Childers TL, Houston MJ. Conditions for a picture-superiority effect on consumer memory. J Consum Res. 1984;11(2):643-654.](https://doi.org/10.1086/209001)
33. [Perrig A, Song D. Hash visualization: a new technique to improve real-world security. Proc CrypTEC '99. 1999:131-138.](https://users.ece.cmu.edu/~adrian/projects/validation/)
34. [Dechand S, Schurmann D, Busse K, Acar Y, Fahl S, Smith M. An empirical study of textual key-fingerprint representations. Proc 25th USENIX Security Symposium. 2016:193-208.](https://usenix.org/conference/usenixsecurity16/technical-sessions/presentation/dechand)
35. [Hsiao H-C, et al. A study of user-friendly hash comparison schemes. Proc ACSAC 2009.](https://www.csie.ntu.edu.tw/~hchsiao/pub/2009_acsac.pdf)
36. [Olembo MM, et al. Developing and testing a visual hash scheme. Inf Comput Secur. 2014;22(4):382.](https://doi.org/10.1108/IMCS-11-2013-0082)
37. [Barlow HB, Reeves BC. The versatility and absolute efficiency of detecting mirror symmetry in random dot displays. Vision Res. 1979;19(7):783-793.](https://doi.org/10.1016/0042-6989(79)90154-8)
38. [Alvarez GA, Cavanagh P. The capacity of visual short-term memory is set both by visual information load and by number of objects. Psychol Sci. 2004;15(2):106-111.](https://doi.org/10.1111/j.0963-7214.2004.01502006.x)
